// =============================================
// 주문 승인 타임아웃 워커 (Phase 4.5)
//
// BullMQ delayed job: 5분 후 실행
// 실행 시점에 status 재확인 — pending이면 타임아웃, 아니면 무시
// =============================================

import { Worker, Job } from 'bullmq'
import { createLogger } from '@smartstore/shared'
import { handleApprovalTimeout } from '@smartstore/core'
import { QUEUE_NAMES, redisConnection, type OrderApprovalJobData } from '../queues'

const logger = createLogger('order-approval-job')

/**
 * 주문 승인 타임아웃 워커
 */
export function createOrderApprovalWorker(): Worker {
  const worker = new Worker<OrderApprovalJobData>(
    QUEUE_NAMES.ORDER_APPROVAL,
    async (job: Job<OrderApprovalJobData>) => {
      const { orderId, action } = job.data

      if (action !== 'check_timeout') {
        logger.warn('알 수 없는 액션', { action, orderId })
        return { skipped: true, reason: 'unknown_action' }
      }

      logger.info('승인 타임아웃 확인', { orderId })

      const result = await handleApprovalTimeout(orderId)

      if (result.ok) {
        logger.info('타임아웃 처리 완료', { orderId })
        return { orderId, processed: true }
      }

      logger.error('타임아웃 처리 실패', { orderId })
      return { orderId, processed: false }
    },
    {
      connection: redisConnection,
      concurrency: 5,
    }
  )

  return worker
}
