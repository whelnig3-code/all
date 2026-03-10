// =============================================
// 자동 배송 알림 발송 작업
// - 운송장 번호 등록
// - 네이버에 발송 처리 확인
// - 고객에게 배송 알림 (텔레그램/SMS)
// =============================================

import { Worker, Job } from 'bullmq'
import { createLogger } from '@smartstore/shared'
import { confirmShipping } from '@smartstore/integrations'
import { notificationAdapter } from '@smartstore/adapters'
import { prisma } from '@smartstore/db'
import { QUEUE_NAMES, redisConnection, type ShippingNotificationJobData } from '../queues'
import { getSetting } from '../settings-cache'
import { checkCredentialGate, gateSkipResult } from '../credential-gate'

const logger = createLogger('shipping-job')

/**
 * 발송 알림 워커
 * - 운송장 등록 → 네이버 발송 처리 → DB 업데이트 → 알림
 */
export function createShippingWorker(): Worker {
  const worker = new Worker<ShippingNotificationJobData>(
    QUEUE_NAMES.SHIPPING_NOTIFICATION,
    async (job: Job<ShippingNotificationJobData>) => {
      // Kill Switch: DB 설정 기반 — AUTO_SHIPPING_ENABLED=false 시 배송 자동 처리 비활성화
      if (getSetting('AUTO_SHIPPING_ENABLED') !== 'true') {
        logger.warn('AUTO_SHIPPING_DISABLED')
        return { skipped: true, reason: 'kill-switch' }
      }

      // 자격증명 게이트: 네이버 커머스 필수
      const gate = await checkCredentialGate(['naver_commerce'])
      if (!gate.passed) return gateSkipResult(gate.missing)

      const { orderId, productOrderId, trackingNumber, courier, customerName, productName } =
        job.data
      logger.info(`배송 알림 처리 시작: ${orderId}`, {
        jobId: job.id,
        trackingNumber,
        courier,
      })

      const jobLog = await prisma.jobLog.create({
        data: {
          jobType: 'shipping',
          jobId: job.id ?? '',
          status: 'started',
          payload: JSON.parse(JSON.stringify(job.data)),
          startedAt: new Date(),
        },
      })

      try {
        // 1. 네이버에 발송 처리 (운송장 등록)
        const shippingConfirmed = await confirmShipping(
          productOrderId,
          courier,
          trackingNumber
        )

        if (!shippingConfirmed) {
          throw new Error(`네이버 발송 처리 실패: ${productOrderId}`)
        }

        // 2. DB 주문 상태 업데이트
        await prisma.order.update({
          where: { id: orderId },
          data: {
            status: 'shipped',
            trackingNumber,
            courier,
            shippedAt: new Date(),
          },
        })

        // 3. 배송 알림 전송 (운영자에게)
        const deliveryUrl = getTrackingUrl(courier, trackingNumber)

        await notificationAdapter.send({
          type: 'order_shipped',
          title: '배송 시작',
          message: [
            `📦 ${productName} 발송 완료`,
            `고객명: ${customerName}`,
            `택배사: ${courier}`,
            `운송장: ${trackingNumber}`,
            deliveryUrl ? `배송 조회: ${deliveryUrl}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
          data: { orderId, trackingNumber, courier },
        })

        // 4. 작업 로그 완료
        await prisma.jobLog.update({
          where: { id: jobLog.id },
          data: {
            status: 'completed',
            result: { trackingNumber, shippingConfirmed },
            completedAt: new Date(),
          },
        })

        logger.info('배송 알림 완료', { orderId, trackingNumber })
        return { success: true, trackingNumber }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)

        await prisma.jobLog.update({
          where: { id: jobLog.id },
          data: { status: 'failed', error: message, completedAt: new Date() },
        })

        // 시스템 오류 알림
        notificationAdapter
          .send({
            type: 'system_error',
            title: '배송 처리 오류',
            message: `주문 ${orderId} 배송 처리 실패: ${message}`,
          })
          .catch(() => {/* 알림 실패 무시 */})

        logger.error('배송 알림 실패', { orderId, error: message })
        throw error
      }
    },
    {
      connection: redisConnection,
      concurrency: 3,
    }
  )

  return worker
}

/**
 * 택배사별 배송 조회 URL 생성
 */
function getTrackingUrl(courier: string, trackingNumber: string): string | null {
  const trackingUrls: Record<string, string> = {
    'CJ대한통운': `https://www.cjlogistics.com/ko/tool/parcel/tracking?gnbInvcNo=${trackingNumber}`,
    '롯데택배': `https://www.lotteglogis.com/home/reservation/tracking/index?InvNo=${trackingNumber}`,
    '한진택배': `https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&schLang=KR&wblnumText2=${trackingNumber}`,
    'GS택배': `https://www.cvsnet.co.kr/invoice/tracking.do?invoice_no=${trackingNumber}`,
    '우체국택배': `https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=${trackingNumber}`,
  }

  return trackingUrls[courier] ?? null
}

/**
 * 발송 대기 주문 목록 조회 (운송장 입력됐지만 알림 미발송)
 */
export async function getOrdersReadyForShipping() {
  return prisma.order.findMany({
    where: {
      status: 'preparing',
      trackingNumber: { not: null },
      shippedAt: null,
    },
    include: {
      product: { select: { name: true } },
    },
  })
}
