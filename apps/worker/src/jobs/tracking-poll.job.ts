// =============================================
// 운송장 번호 폴링 워커
// - 도매처 주문 후 운송장 번호 자동 확인
// - 발견 시 shipping-notification 큐로 발송 처리 위임
// - 미발견 시 30분 간격 재시도 (최대 48회)
// =============================================

import { Worker, Job } from 'bullmq'
import { createLogger, config } from '@smartstore/shared'
import { DomaeggukOrderer, OwnerclanOrderer, OnchannelOrderer } from '@smartstore/crawlers'
import { notificationAdapter } from '@smartstore/adapters'
import { prisma } from '@smartstore/db'
import {
  QUEUE_NAMES,
  redisConnection,
  trackingPollQueue,
  shippingNotificationQueue,
  type TrackingPollJobData,
} from '../queues'

const logger = createLogger('tracking-poll-job')
const POLL_INTERVAL_MS = 30 * 60 * 1000 // 30분

/**
 * source에 따라 올바른 Orderer 인스턴스 생성
 *
 * 비유: 택배 조회를 할 때 CJ대한통운이면 CJ 사이트에, 로젠이면 로젠 사이트에 가듯이
 * domaegguk이면 도매꾹 크롤러, ownerclan이면 오너클랜 크롤러를 사용한다.
 */
function createOrderer(source: 'domaegguk' | 'ownerclan' | 'onchannel') {
  switch (source) {
    case 'domaegguk':
      return new DomaeggukOrderer(
        config.domeggook.username,
        config.domeggook.password,
      )
    case 'ownerclan':
      return new OwnerclanOrderer(
        config.ownerclan.username,
        config.ownerclan.password,
      )
    case 'onchannel':
      return new OnchannelOrderer(
        config.onchannel.username,
        config.onchannel.password,
      )
  }
}

/**
 * 운송장 폴링 워커
 *
 * 비유: 택배가 언제 출발하는지 30분마다 확인하는 알람 시계.
 * 운송장이 나오면 네이버에 발송 처리를 요청하고, 나오지 않으면 다시 알람을 맞춘다.
 * 48번(24시간) 확인해도 안 나오면 사람에게 알린다.
 */
export function createTrackingPollWorker(): Worker {
  const worker = new Worker<TrackingPollJobData>(
    QUEUE_NAMES.TRACKING_POLL,
    async (job: Job<TrackingPollJobData>) => {
      const { orderId, wholesaleOrderId, source, naverProductOrderId, pollAttempt, maxAttempts } = job.data

      const orderer = createOrderer(source)

      try {
        await orderer.login()
        const trackingNumber = await orderer.getTrackingNumber(wholesaleOrderId)

        if (trackingNumber) {
          // 운송장 발견: DB 업데이트 + shipping-notification 큐에 추가
          const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { product: { select: { name: true } } },
          })

          await prisma.order.update({
            where: { id: orderId },
            data: {
              trackingNumber,
              courier: '택배사확인필요',
              wholesaleOrderStatus: 'shipped',
              lastTrackingPollAt: new Date(),
              trackingPollCount: { increment: 1 },
            },
          })

          // shipping-notification 큐에 발송 처리 작업 추가
          await shippingNotificationQueue.add('ship-notification', {
            orderId,
            productOrderId: naverProductOrderId,
            trackingNumber,
            courier: '택배사확인필요',
            customerName: order?.customerName ?? '',
            productName: order?.product?.name ?? '',
          })

          logger.info('운송장 발견', { orderId, trackingNumber: '***' })
        } else if (pollAttempt < maxAttempts) {
          // 운송장 미발견: DB 폴링 기록 업데이트 + 재스케줄
          await prisma.order.update({
            where: { id: orderId },
            data: {
              lastTrackingPollAt: new Date(),
              trackingPollCount: { increment: 1 },
            },
          })

          await trackingPollQueue.add('poll-tracking', {
            ...job.data,
            pollAttempt: pollAttempt + 1,
          }, { delay: POLL_INTERVAL_MS })

          logger.info('운송장 미확인, 재시도 예약', { orderId, attempt: pollAttempt + 1 })
        } else {
          // 최대 시도 초과: DB 업데이트 + 텔레그램 알림
          await prisma.order.update({
            where: { id: orderId },
            data: {
              lastTrackingPollAt: new Date(),
              trackingPollCount: { increment: 1 },
            },
          })

          await notificationAdapter.send({
            type: 'system_alert',
            title: '운송장 폴링 최대 시도 초과',
            message: [
              `주문 ${orderId}의 운송장을 확인하지 못했습니다.`,
              `도매처 주문번호: ${wholesaleOrderId}`,
              `시도 횟수: ${pollAttempt}/${maxAttempts}`,
              `수동 확인이 필요합니다.`,
            ].join('\n'),
            data: { orderId, wholesaleOrderId },
          })

          logger.warn('운송장 폴링 최대 시도 초과', { orderId, wholesaleOrderId })
        }
      } finally {
        await orderer.close()
      }
    },
    { connection: redisConnection, concurrency: 1 },
  )

  return worker
}
