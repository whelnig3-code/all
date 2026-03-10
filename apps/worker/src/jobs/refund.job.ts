// =============================================
// 환불/교환 자동 처리 워커
//
// 동작 방식:
//   - 네이버 취소/반품 요청 감지
//   - 자동 승인/거절 규칙 적용
//   - 네이버 커머스 API 호출
//   - 처리 결과 DB 기록 + 알림 발송
// =============================================

import { Worker, Job } from 'bullmq'
import { createLogger } from '@smartstore/shared'
import { naverCommerceApi } from '@smartstore/integrations'
import { notificationAdapter } from '@smartstore/adapters'
import { prisma } from '@smartstore/db'
import { QUEUE_NAMES, redisConnection, type RefundJobData } from '../queues'
import { getSetting } from '../settings-cache'
import { checkCredentialGate, gateSkipResult } from '../credential-gate'

const logger = createLogger('refund-job')

// =============================================
// 타입 정의
// =============================================

/** 자동 처리 결정 */
interface RefundDecision {
  action: 'approve' | 'reject' | 'manual'
  reason: string
}

/** API 처리 결과 */
interface RefundApiResult {
  status: 'APPROVED' | 'REJECTED' | 'PENDING_MANUAL' | 'ERROR'
  message: string
}

/** 자동 승인 설정 */
interface AutoApproveConfig {
  /** 자동 승인 최대 금액 (원, 초과 시 수동 처리) */
  maxAmount: number
  /** 자동 승인 사유 키워드 */
  approveKeywords: readonly string[]
  /** 자동 거절 사유 키워드 */
  rejectKeywords: readonly string[]
}

// 기본 자동 승인 설정 — 추후 DB 설정으로 마이그레이션 가능
const DEFAULT_AUTO_APPROVE_CONFIG: AutoApproveConfig = {
  maxAmount: 50_000, // 5만원 이하 자동 승인
  approveKeywords: ['단순변심', '사이즈교환', '색상교환'],
  rejectKeywords: ['사용흔적', '택제거', '세탁후'],
} as const

// =============================================
// 메인 워커
// =============================================

/**
 * 환불/교환 처리 워커 생성
 */
export function createRefundWorker(): Worker {
  const worker = new Worker<RefundJobData>(
    QUEUE_NAMES.REFUND_PROCESSING,
    async (job: Job<RefundJobData>) => {
      // Kill Switch
      if (getSetting('AUTO_REFUND_ENABLED') !== 'true') {
        logger.warn('AUTO_REFUND_DISABLED')
        return { skipped: true, reason: 'kill-switch' }
      }

      // 자격증명 게이트: 네이버 커머스 필수
      const gate = await checkCredentialGate(['naver_commerce'])
      if (!gate.passed) return gateSkipResult(gate.missing)

      const { orderId, type, reason } = job.data
      const startTime = Date.now()

      logger.info(`환불/교환 처리 시작: ${type}`, { orderId, reason, jobId: job.id })

      try {
        // 1. 주문 정보 조회
        const order = await prisma.order.findUnique({
          where: { naverOrderId: orderId },
        })

        if (!order) {
          throw new Error(`주문 정보를 찾을 수 없습니다: ${orderId}`)
        }

        // 2. 자동 처리 결정
        const decision = evaluateRefundRequest({
          type,
          reason,
          orderAmount: order.totalAmount,
          config: DEFAULT_AUTO_APPROVE_CONFIG,
        })

        logger.info(`자동 처리 결정: ${decision.action}`, { orderId, reason: decision.reason })

        // 3. 네이버 API 호출
        const apiResult = await executeRefundAction({
          type,
          productOrderId: orderId,
          decision,
          reason,
        })

        // 4. 처리 결과 DB 저장
        await prisma.refundProcessLog.create({
          data: {
            naverOrderId: orderId,
            productOrderId: orderId,
            type,
            reason,
            action: decision.action,
            status: apiResult.status,
            processingTime: Date.now() - startTime,
          },
        })

        // 5. 알림 발송
        await notificationAdapter.send({
          type: `refund_${apiResult.status.toLowerCase()}`,
          title: type === 'refund' ? '환불 처리 완료' : '교환 처리 완료',
          message: [
            `주문번호: ${orderId}`,
            `유형: ${type === 'refund' ? '환불' : '교환'}`,
            `결정: ${decision.action}`,
            `사유: ${reason}`,
            `결과: ${apiResult.message}`,
          ].join('\n'),
          data: { orderId, type, status: apiResult.status },
        })

        logger.info('환불/교환 처리 완료', { orderId, status: apiResult.status })

        return {
          success: true,
          action: decision.action,
          status: apiResult.status,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)

        // 에러 로그 DB 저장
        await prisma.refundProcessLog.create({
          data: {
            naverOrderId: orderId,
            type,
            reason,
            action: 'manual',
            status: 'ERROR',
            errorMessage: message,
            processingTime: Date.now() - startTime,
          },
        })

        logger.error('환불/교환 처리 실패', { orderId, error: message })

        // 재시도 가능 에러면 throw (BullMQ 자동 재시도)
        if (isRetryableError(error, job.attemptsMade)) {
          throw error
        }

        return { success: false, error: message }
      }
    },
    {
      connection: redisConnection,
      concurrency: 3,
    }
  )

  return worker
}

// =============================================
// 비즈니스 로직
// =============================================

/**
 * 환불/교환 요청 평가 — 자동 승인/거절/수동 처리 결정
 *
 * 비유: 편의점 교환 정책처럼 금액이 작고 사유가 명확하면 바로 승인,
 *       고가이거나 모호하면 매니저(CEO)에게 넘긴다.
 */
function evaluateRefundRequest(params: {
  type: 'refund' | 'exchange'
  reason: string
  orderAmount: number
  config: AutoApproveConfig
}): RefundDecision {
  const { type, reason, orderAmount, config: approveConfig } = params
  const lowerReason = reason.toLowerCase()

  // 자동 거절 키워드 체크 (우선)
  for (const keyword of approveConfig.rejectKeywords) {
    if (lowerReason.includes(keyword)) {
      return { action: 'reject', reason: `자동 거절: ${keyword} 키워드 매칭` }
    }
  }

  // 금액 제한 초과 → 수동 처리
  if (orderAmount > approveConfig.maxAmount) {
    return {
      action: 'manual',
      reason: `금액 초과 (${orderAmount.toLocaleString()}원 > ${approveConfig.maxAmount.toLocaleString()}원)`,
    }
  }

  // 자동 승인 키워드 체크
  for (const keyword of approveConfig.approveKeywords) {
    if (lowerReason.includes(keyword)) {
      return { action: 'approve', reason: `자동 승인: ${keyword} 키워드 매칭` }
    }
  }

  // 기본: 수동 처리
  return { action: 'manual', reason: '자동 처리 조건 미충족' }
}

/**
 * 네이버 API 호출로 환불/교환 처리 실행
 */
async function executeRefundAction(params: {
  type: 'refund' | 'exchange'
  productOrderId: string
  decision: RefundDecision
  reason: string
}): Promise<RefundApiResult> {
  const { type, productOrderId, decision, reason } = params

  if (decision.action === 'manual') {
    return { status: 'PENDING_MANUAL', message: '수동 처리가 필요합니다' }
  }

  try {
    if (type === 'refund') {
      if (decision.action === 'approve') {
        await naverCommerceApi.approveCancel({ productOrderId, cancelReason: reason })
        return { status: 'APPROVED', message: '환불이 승인되었습니다' }
      } else {
        await naverCommerceApi.rejectCancel({ productOrderId, rejectReason: decision.reason })
        return { status: 'REJECTED', message: '환불이 거절되었습니다' }
      }
    } else {
      if (decision.action === 'approve') {
        await naverCommerceApi.approveReturn({ productOrderId, returnReason: reason })
        return { status: 'APPROVED', message: '교환이 승인되었습니다' }
      } else {
        await naverCommerceApi.rejectReturn({ productOrderId, rejectReason: decision.reason })
        return { status: 'REJECTED', message: '교환이 거절되었습니다' }
      }
    }
  } catch (error) {
    logger.error('네이버 API 호출 실패', { type, productOrderId, error })
    return { status: 'ERROR', message: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * 재시도 가능 에러 판단
 */
function isRetryableError(error: unknown, attemptsMade: number): boolean {
  if (attemptsMade >= 3) return false

  if (error instanceof Error) {
    const retryableCodes = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', '502', '503', '504']
    return retryableCodes.some((code) => error.message.includes(code))
  }

  return false
}

// evaluateRefundRequest를 테스트용으로 export
export { evaluateRefundRequest }
