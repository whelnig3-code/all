// =============================================
// 도매처 자동 주문 워커
//
// 비유: 구매 대행사가 주문서를 받고 도매처에
//       대신 주문을 넣어주는 것과 같다.
//
// 흐름:
//   1. Kill switch 체크
//   2. 중복 발주 방지 (이미 ordered이면 skip)
//   3. credentials 검증
//   4. Orderer 생성 (도매꾹/오너클랜)
//   5. 로그인 + 주문
//   6. 성공: DB 업데이트 + 로그 + tracking-poll 큐 추가
//   7. 실패: DB 업데이트 + 로그 + 알림
// =============================================

import { Worker, Job } from 'bullmq'
import { config, createLogger } from '@smartstore/shared'
import { DomaeggukOrderer, OwnerclanOrderer } from '@smartstore/crawlers'
import { notificationAdapter } from '@smartstore/adapters'
import { prisma } from '@smartstore/db'
import {
  QUEUE_NAMES,
  redisConnection,
  trackingPollQueue,
  type WholesaleOrderJobData,
} from '../queues'

const logger = createLogger('wholesale-order-job')

/**
 * 도매처 자동 주문 워커 생성
 *
 * - concurrency=1: 브라우저 기반 크롤링이므로 직렬 처리
 * - 실패 시 BullMQ의 기본 재시도 정책(3회, 지수 백오프)을 따름
 */
export function createWholesaleOrderWorker(): Worker {
  const worker = new Worker<WholesaleOrderJobData>(
    QUEUE_NAMES.WHOLESALE_ORDER,
    async (job: Job<WholesaleOrderJobData>) => {
      // 1. Kill switch
      if (!config.autoWholesaleOrderEnabled) {
        logger.info('도매 자동 발주 비활성화')
        return { skipped: true, reason: 'kill-switch' }
      }

      const { orderId, naverOrderId, source, sourceProductId, quantity, shippingAddress, productOptions } = job.data

      // 2. 중복 발주 방지
      const existingOrder = await prisma.order.findUnique({
        where: { id: orderId },
      })

      if (existingOrder?.wholesaleOrderStatus === 'ordered') {
        logger.info('이미 발주 완료된 주문', { orderId })
        return { skipped: true, reason: 'already-ordered', orderId }
      }

      // 3. credentials 검증
      const credentials = getCredentials(source)
      if (!credentials.username || !credentials.password) {
        throw new Error(`${source} credentials 미설정`)
      }

      // 4. Orderer 생성
      const orderer = createOrderer(source, credentials.username, credentials.password)

      try {
        // 5. 로그인 + 주문
        await orderer.login()
        const result = await orderer.placeOrder({
          sourceProductId,
          quantity,
          shippingAddress,
          productOptions,
        })

        if (result.success) {
          // 6-a. DB 업데이트: ordered
          await prisma.order.update({
            where: { id: orderId },
            data: {
              wholesaleOrderStatus: 'ordered',
              wholesaleOrderId: result.wholesaleOrderId,
              wholesaleSource: source,
              wholesaleOrderedAt: new Date(),
            },
          })

          // 6-b. WholesaleOrderLog
          await prisma.wholesaleOrderLog.create({
            data: {
              orderId,
              source,
              wholesaleOrderId: result.wholesaleOrderId ?? null,
              status: 'ordered',
            },
          })

          // 6-c. tracking-poll 큐에 30분 후 폴링 추가
          await trackingPollQueue.add(
            'poll-tracking',
            {
              orderId,
              wholesaleOrderId: result.wholesaleOrderId!,
              source,
              naverProductOrderId: naverOrderId,
              pollAttempt: 0,
              maxAttempts: 48,
            },
            { delay: 30 * 60 * 1000 },
          )

          logger.info('도매 발주 성공', { orderId, sourceProductId })
          return { orderId, wholesaleOrderId: result.wholesaleOrderId }
        }

        // 7-a. 실패: DB 업데이트
        await prisma.order.update({
          where: { id: orderId },
          data: {
            wholesaleOrderStatus: 'failed',
          },
        })

        // 7-b. WholesaleOrderLog 에러 기록
        await prisma.wholesaleOrderLog.create({
          data: {
            orderId,
            source,
            status: 'failed',
            errorMessage: result.errorMessage ?? '알 수 없는 오류',
            screenshotPath: result.screenshotPath ?? null,
          },
        })

        // 7-c. 알림 발송
        await notificationAdapter.send({
          type: 'wholesale_order_failed',
          title: '도매 발주 실패',
          message: [
            `주문 ID: ${orderId}`,
            `도매처: ${source}`,
            `사유: ${result.errorMessage ?? '알 수 없는 오류'}`,
          ].join('\n'),
          data: { orderId, source, error: result.errorMessage },
        })

        logger.error('도매 발주 실패', { orderId, sourceProductId, error: result.errorMessage })
        return { orderId, status: 'failed', error: result.errorMessage }
      } finally {
        await orderer.close()
      }
    },
    {
      connection: redisConnection,
      concurrency: 1,
    },
  )

  return worker
}

/**
 * source별 credentials 조회
 */
function getCredentials(source: string): { username: string; password: string } {
  switch (source) {
    case 'domaegguk':
      return { username: config.domeggook.username, password: config.domeggook.password }
    case 'ownerclan':
      return { username: config.ownerclan.username, password: config.ownerclan.password }
    default:
      throw new Error(`Unknown source: ${source}`)
  }
}

/**
 * source별 Orderer 팩토리
 */
function createOrderer(source: string, username: string, password: string) {
  switch (source) {
    case 'domaegguk':
      return new DomaeggukOrderer(username, password)
    case 'ownerclan':
      return new OwnerclanOrderer(username, password)
    default:
      throw new Error(`Unknown source: ${source}`)
  }
}
