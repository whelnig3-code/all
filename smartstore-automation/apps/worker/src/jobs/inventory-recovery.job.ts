// =============================================
// 재고 복구 워커
//
// 역할:
//   - 판매 중지 상태 + 재고 SAFE_STOCK 초과 상품 → 판매 재개
//   - inventory-sync 워커가 재고 증가 감지 후 트리거 가능
//   - 또는 독립 스케줄로 실행하여 누락 복구
// =============================================

import { Worker, Job } from 'bullmq'
import { createLogger } from '@smartstore/shared'
import { SAFE_STOCK, resumeListing } from '@smartstore/core'
import { notificationAdapter } from '@smartstore/adapters'
import { prisma } from '@smartstore/db'
import { QUEUE_NAMES, redisConnection, type InventoryRecoveryJobData } from '../queues'
import { getSetting } from '../settings-cache'

const logger = createLogger('inventory-recovery-job')

/**
 * 재고 복구 워커: 판매 중지 상태에서 재고 복구 시 자동 재개
 */
export function createInventoryRecoveryWorker(): Worker {
  const worker = new Worker<InventoryRecoveryJobData>(
    QUEUE_NAMES.INVENTORY_RECOVERY,
    async (job: Job<InventoryRecoveryJobData>) => {
      if (getSetting('AUTO_INVENTORY_SYNC_ENABLED') !== 'true') {
        logger.warn('AUTO_INVENTORY_SYNC_DISABLED')
        return { skipped: true, reason: 'kill-switch' }
      }

      const { productId } = job.data

      try {
        const product = await prisma.product.findUnique({
          where: { id: productId },
          select: {
            id: true,
            name: true,
            cachedStock: true,
            listingPaused: true,
          },
        })

        if (!product) {
          logger.warn('상품 미존재', { productId })
          return { skipped: true, reason: 'product_not_found' }
        }

        if (!product.listingPaused) {
          logger.debug('이미 판매 중', { productId })
          return { skipped: true, reason: 'already_active' }
        }

        if (product.cachedStock <= SAFE_STOCK) {
          logger.debug('재고 아직 부족', { productId, cachedStock: product.cachedStock })
          return { skipped: true, reason: 'still_low' }
        }

        // 재고 복구 → 판매 재개
        const result = await resumeListing(productId, `재고 복구 (${product.cachedStock} > ${SAFE_STOCK})`)

        if (result.ok) {
          await notificationAdapter.send({
            type: 'inventory_recovered',
            title: '재고 복구 알림',
            message: [
              `상품: ${product.name}`,
              `현재 재고: ${product.cachedStock}`,
              `조치: 판매 재개됨`,
            ].join('\n'),
            data: { productId },
          })

          logger.info('판매 재개 완료', { productId })
          return { productId, resumed: true }
        }

        logger.error('판매 재개 실패', { productId })
        return { productId, resumed: false }
      } catch (error) {
        logger.error('재고 복구 실패', { productId, error })
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
