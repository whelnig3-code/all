// =============================================
// 주문 자동 확인 및 처리 작업
// - 네이버에서 새 주문 폴링
// - DB 저장 및 상태 동기화
// - 도매처 발주 준비
// =============================================

import { Worker, Job, Queue } from 'bullmq'
import { createLogger } from '@smartstore/shared'
import { fetchNewOrders, mapNaverOrderToInternal } from '@smartstore/integrations'
import { notificationAdapter } from '@smartstore/adapters'
import { prisma } from '@smartstore/db'
import { encryptPhone, createApprovalRequest } from '@smartstore/core'
import {
  QUEUE_NAMES,
  redisConnection,
  shippingNotificationQueue,
  orderApprovalQueue,
  type OrderJobData,
  type ShippingNotificationJobData,
} from '../queues'
import { getSetting } from '../settings-cache'
import { checkCredentialGate, gateSkipResult } from '../credential-gate'

const logger = createLogger('order-job')

/**
 * 주문 처리 워커
 * - 개별 주문 아이템을 처리
 * - DB 저장 + 알림 발송
 */
export function createOrderWorker(): Worker {
  const worker = new Worker<OrderJobData>(
    QUEUE_NAMES.ORDER_PROCESSING,
    async (job: Job<OrderJobData>) => {
      // Kill Switch: DB 설정 기반 — AUTO_ORDER_ENABLED=false 시 주문 자동 처리 비활성화
      if (getSetting('AUTO_ORDER_ENABLED') !== 'true') {
        logger.warn('AUTO_ORDER_DISABLED')
        return { skipped: true, reason: 'kill-switch' }
      }

      // 자격증명 게이트: 네이버 커머스 필수
      const gate = await checkCredentialGate(['naver_commerce'])
      if (!gate.passed) return gateSkipResult(gate.missing)

      const { naverOrderId } = job.data
      // 계정 ID: job.data → ENV → 'default' 순으로 fallback
      const accountId = job.data.accountId ?? process.env['ACCOUNT_ID'] ?? 'default'
      logger.info(`주문 처리 시작: ${naverOrderId}`, { jobId: job.id })

      const jobLog = await prisma.jobLog.create({
        data: {
          jobType: 'order',
          jobId: job.id ?? '',
          status: 'started',
          payload: { naverOrderId },
          startedAt: new Date(),
        },
      })

      try {
        // 1. 이미 처리된 주문인지 확인
        const existing = await prisma.order.findUnique({
          where: { naverOrderId },
        })

        if (existing) {
          logger.debug(`이미 처리된 주문: ${naverOrderId}`)
          return { skipped: true, orderId: existing.id }
        }

        // 2. 네이버 주문 아이템에서 고객 정보 추출
        //    poll 트리거: orderItem에 이미 고객 정보 포함
        //    webhook 트리거: orderItem 없음 → 빈 문자열 fallback
        const orderItem = job.data.orderItem
        const mapped = orderItem ? mapNaverOrderToInternal(orderItem) : null

        // 3. 상품 매핑 (orderItem.productId로 정확히 매핑, 없으면 최신 활성 상품)
        const product = orderItem?.productId
          ? await prisma.product.findFirst({
              where: { naverProductId: orderItem.productId },
            })
          : await prisma.product.findFirst({
              where: { naverProductId: { not: null } },
              orderBy: { registeredAt: 'desc' },
            })

        if (!product) {
          throw new Error(`상품 매핑 실패: 네이버 주문 ${naverOrderId}`)
        }

        // 4. 주문 DB 저장
        //    customerPhone: AES-256-GCM 암호화 후 3개 필드(ciphertext/iv/authTag)로 분리 저장
        const quantity = mapped?.quantity ?? 1
        const salePrice = mapped?.salePrice ?? product.salePrice

        // 실제 마진 계산 (월 수익 시뮬레이션 데이터 축적용)
        const fee = Math.round(salePrice * product.naverFeeRate)
        const wholesaleCost = (product.wholesalePrice ?? 0) + (product.shippingFee ?? 0)
        const marginAmount = salePrice - wholesaleCost - fee
        const calculatedMarginRate = salePrice > 0
          ? parseFloat((marginAmount / salePrice).toFixed(4))
          : 0

        // 전화번호 암호화 (값 없으면 빈 문자열 저장 — webhook 트리거 등 정보 미포함 케이스)
        const phoneEncrypted = mapped?.customerPhone
          ? encryptPhone(mapped.customerPhone)
          : { ciphertext: '', iv: '', authTag: '' }

        const order = await prisma.order.create({
          data: {
            naverOrderId,
            naverProductId: product.naverProductId ?? '',
            productId: product.id,
            quantity,
            salePrice,
            totalAmount: salePrice * quantity,
            status: mapped?.status ?? 'paid',
            customerName: mapped?.customerName ?? '',
            customerPhoneCiphertext: phoneEncrypted.ciphertext,
            customerPhoneIv: phoneEncrypted.iv,
            customerPhoneAuthTag: phoneEncrypted.authTag,
            customerAddress: mapped?.customerAddress ?? '',
            customerZipCode: orderItem?.shippingAddress?.zipCode ?? '',
            accountId,
            marginAmount: parseFloat(marginAmount.toFixed(2)),
            marginRate: calculatedMarginRate,
            orderedAt: mapped?.orderedAt ?? new Date(),
            paidAt: mapped?.paidAt ?? new Date(),
          },
        })

        // 5. 승인 모드 분기 (Phase 4.5)
        if (getSetting('ORDER_APPROVAL_MODE') === 'true') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const queueAdd = (name: string, data: any, opts?: any) =>
            orderApprovalQueue.add(name, data, opts)
          const approvalResult = await createApprovalRequest(order.id, queueAdd)

          if (!approvalResult.ok) {
            logger.warn('승인 요청 생성 실패 — 알림만 전송', {
              orderId: order.id,
              error: approvalResult.error.message,
            })
          }

          // 작업 로그 완료
          await prisma.jobLog.update({
            where: { id: jobLog.id },
            data: {
              status: 'completed',
              result: { orderId: order.id, status: 'pending_approval' },
              completedAt: new Date(),
            },
          })

          logger.info('주문 승인 대기', { naverOrderId, orderId: order.id })
          return { orderId: order.id, status: 'pending_approval' }
        }

        // 6. 기존 자동 모드: 새 주문 알림 전송
        await notificationAdapter.send({
          type: 'order_received',
          title: '새 주문 도착',
          message: [
            `새 주문이 들어왔습니다.`,
            `주문번호: ${naverOrderId}`,
            `상품: ${product.name}`,
            mapped?.customerName ? `고객: ${mapped.customerName}` : '',
            `수량: ${quantity}개 / ${salePrice.toLocaleString()}원`,
          ].filter(Boolean).join('\n'),
          data: { orderId: order.id, naverOrderId },
        })

        // 7. 작업 로그 완료
        await prisma.jobLog.update({
          where: { id: jobLog.id },
          data: {
            status: 'completed',
            result: { orderId: order.id },
            completedAt: new Date(),
          },
        })

        logger.info('주문 처리 완료', { naverOrderId, orderId: order.id })
        return { orderId: order.id }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)

        await prisma.jobLog.update({
          where: { id: jobLog.id },
          data: { status: 'failed', error: message, completedAt: new Date() },
        })

        logger.error('주문 처리 실패', { naverOrderId, error: message })
        throw error
      }
    },
    {
      connection: redisConnection,
      concurrency: 5, // 주문 처리는 병렬 처리 허용
    }
  )

  return worker
}

/**
 * 네이버 새 주문 폴링 + 큐에 추가
 * - 스케줄러(index.ts)에서 주기적 호출
 */
export async function pollAndEnqueueNewOrders(
  orderQueue: Queue
): Promise<number> {
  // Kill Switch: DB 설정 기반 — AUTO_ORDER_ENABLED=false 시 자동 폴링 중단
  if (getSetting('AUTO_ORDER_ENABLED') !== 'true') {
    logger.warn('AUTO_ORDER_DISABLED')
    return 0
  }

  logger.debug('새 주문 폴링 시작')

  try {
    const newOrders = await fetchNewOrders()

    if (newOrders.length === 0) {
      logger.debug('새 주문 없음')
      return 0
    }

    // 이미 DB에 있는 주문 ID 필터링
    const existingOrders = await prisma.order.findMany({
      where: {
        naverOrderId: { in: newOrders.map((o) => o.productOrderId) },
      },
      select: { naverOrderId: true },
    })

    const existingIds = new Set(existingOrders.map((o) => o.naverOrderId))

    // 신규 주문만 필터
    const brandNewOrders = newOrders.filter(
      (o) => !existingIds.has(o.productOrderId)
    )

    if (brandNewOrders.length === 0) {
      logger.debug('처리할 신규 주문 없음')
      return 0
    }

    // 큐에 추가 (orderItem을 함께 전달하여 워커에서 고객 정보 직접 사용)
    // accountId를 job data에 포함하여 워커가 ENV 없이도 계정 구분 가능
    const accountId = process.env['ACCOUNT_ID'] ?? 'default'
    await orderQueue.addBulk(
      brandNewOrders.map((order) => ({
        name: 'process-order',
        data: {
          naverOrderId: order.productOrderId,
          trigger: 'poll',
          orderItem: order,
          accountId,
        } as OrderJobData,
      }))
    )
    logger.info(`신규 주문 ${brandNewOrders.length}건 처리 큐에 추가`)
    return brandNewOrders.length
  } catch (error) {
    logger.error('주문 폴링 실패', error)
    return 0
  }
}
