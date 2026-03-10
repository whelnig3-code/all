// =============================================
// 재고 동기화 워커
//
// 역할:
//   - 10분마다 active/registered 상품의 공급처 재고 조회
//   - DB 재고 캐시 업데이트 (supplierStock, cachedStock, lastStockSync)
//   - SAFE_STOCK 이하 → 판매 중지 트리거
//   - 재고 복구 감지 → 판매 재개 트리거
// =============================================

import { Worker, Job, Queue } from 'bullmq'
import { createLogger } from '@smartstore/shared'
import {
  SAFE_STOCK,
  isStockLow,
  isStockOut,
  pauseListing,
  resumeListing,
} from '@smartstore/core'
import { DomaeggukCrawler, OwnerclanCrawler } from '@smartstore/crawlers'
import { notificationAdapter } from '@smartstore/adapters'
import { prisma } from '@smartstore/db'
import { QUEUE_NAMES, redisConnection, type InventorySyncJobData } from '../queues'
import { getSetting } from '../settings-cache'

const logger = createLogger('inventory-sync-job')

/**
 * 재고 동기화 워커: 개별 상품 재고 업데이트
 */
export function createInventorySyncWorker(): Worker {
  const worker = new Worker<InventorySyncJobData>(
    QUEUE_NAMES.INVENTORY_SYNC,
    async (job: Job<InventorySyncJobData>) => {
      // Kill Switch
      if (getSetting('AUTO_INVENTORY_SYNC_ENABLED') !== 'true') {
        logger.warn('AUTO_INVENTORY_SYNC_DISABLED')
        return { skipped: true, reason: 'kill-switch' }
      }

      const { productId, source, sourceProductId } = job.data
      logger.debug(`재고 동기화: ${productId} (${source}:${sourceProductId})`)

      const jobLog = await prisma.jobLog.create({
        data: {
          jobType: 'inventory_sync',
          jobId: job.id ?? '',
          status: 'started',
          payload: { productId, source, sourceProductId },
          startedAt: new Date(),
        },
      })

      try {
        // 1. 현재 상품 정보 조회
        const product = await prisma.product.findUnique({
          where: { id: productId },
          select: {
            id: true,
            name: true,
            cachedStock: true,
            supplierStock: true,
            reservedStock: true,
            listingPaused: true,
          },
        })

        if (!product) {
          throw new Error(`상품을 찾을 수 없습니다: ${productId}`)
        }

        // 2. 공급처 재고 조회 — fetchStockOnly 경량 메서드 구현 후 교체 예정 (Phase 4-B)
        // 현재는 기존 크롤러(fetchSupplierStock)를 사용
        const supplierStock = await fetchSupplierStock(source, sourceProductId)
        const previousCached = product.cachedStock

        // 3. DB 업데이트
        await prisma.product.update({
          where: { id: productId },
          data: {
            supplierStock,
            cachedStock: supplierStock,
            lastStockSync: new Date(),
          },
        })

        // 4. InventoryEvent 기록
        await prisma.inventoryEvent.create({
          data: {
            productId,
            type: 'sync',
            previousStock: previousCached,
            newStock: supplierStock,
            reason: `${source} 동기화`,
          },
        })

        // 5. 재고 상태 판단 + 자동 중지/재개
        const stockFields = { cachedStock: supplierStock, reservedStock: product.reservedStock }

        if (isStockOut(stockFields) && !product.listingPaused) {
          // 재고 소진 → 판매 중지
          await pauseListing(productId, '재고 소진 (공급처 재고 0)')
          await notificationAdapter.send({
            type: 'inventory_out',
            title: '재고 소진 알림',
            message: [
              `상품: ${product.name}`,
              `공급처 재고: ${supplierStock}`,
              `조치: 판매 중지됨`,
            ].join('\n'),
            data: { productId },
          })
        } else if (isStockLow(stockFields) && !product.listingPaused) {
          // 재고 부족 → 판매 중지
          await pauseListing(productId, `안전 재고 이하 (${supplierStock} <= ${SAFE_STOCK})`)
          await notificationAdapter.send({
            type: 'inventory_low',
            title: '재고 부족 경고',
            message: [
              `상품: ${product.name}`,
              `공급처 재고: ${supplierStock}`,
              `안전 재고: ${SAFE_STOCK}`,
              `조치: 판매 중지됨`,
            ].join('\n'),
            data: { productId },
          })
        } else if (!isStockLow(stockFields) && product.listingPaused) {
          // 재고 복구 → 판매 재개
          await resumeListing(productId, `재고 복구 (${supplierStock} > ${SAFE_STOCK})`)
          await notificationAdapter.send({
            type: 'inventory_recovered',
            title: '재고 복구 알림',
            message: [
              `상품: ${product.name}`,
              `공급처 재고: ${supplierStock}`,
              `조치: 판매 재개됨`,
            ].join('\n'),
            data: { productId },
          })
        }

        // 6. 작업 로그 완료
        await prisma.jobLog.update({
          where: { id: jobLog.id },
          data: {
            status: 'completed',
            result: { supplierStock, previousCached },
            completedAt: new Date(),
          },
        })

        logger.info('재고 동기화 완료', { productId, supplierStock })
        return { productId, supplierStock }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await prisma.jobLog.update({
          where: { id: jobLog.id },
          data: { status: 'failed', error: message, completedAt: new Date() },
        })
        logger.error('재고 동기화 실패', { productId, error: message })
        throw error
      }
    },
    {
      connection: redisConnection,
      concurrency: 3, // 크롤러 부하 고려 — 동시 3개
    }
  )

  return worker
}

/**
 * 공급처 재고 조회 — 크롤러로 상품 상세 페이지에서 재고 추출
 *
 * 비유: 도매처 매장에 전화해서 "이 상품 몇 개 남았어요?" 확인하는 것.
 * 실패 시 0 반환 → pauseListing 트리거 (거짓 "재고 있음"보다 거짓 "품절"이 안전)
 */
async function fetchSupplierStock(
  source: string,
  sourceProductId: string
): Promise<number> {
  const crawler = source === 'domaegguk'
    ? new DomaeggukCrawler({ headless: true })
    : new OwnerclanCrawler({ headless: true })

  try {
    const product = await crawler.crawlProductDetail(sourceProductId)

    if (!product) {
      logger.warn('공급처 상품 조회 실패 — 0 반환', { source, sourceProductId })
      return 0
    }

    return product.stockQuantity
  } finally {
    await crawler.close()
  }
}

/**
 * 전체 상품 재고 동기화 폴링 + 큐에 추가
 * - 스케줄러(index.ts)에서 10분마다 호출
 */
export async function pollAndSyncInventory(
  syncQueue: Queue
): Promise<number> {
  if (getSetting('AUTO_INVENTORY_SYNC_ENABLED') !== 'true') {
    logger.warn('AUTO_INVENTORY_SYNC_DISABLED')
    return 0
  }

  logger.debug('재고 동기화 폴링 시작')

  try {
    // active 또는 registered 상태 상품 조회
    const products = await prisma.product.findMany({
      where: {
        status: { in: ['active', 'registered'] },
        source: { in: ['domaegguk', 'ownerclan'] },
      },
      select: {
        id: true,
        source: true,
        sourceProductId: true,
      },
    })

    if (products.length === 0) {
      logger.debug('동기화 대상 상품 없음')
      return 0
    }

    await syncQueue.addBulk(
      products.map((p) => ({
        name: 'sync-stock',
        data: {
          productId: p.id,
          source: p.source as 'domaegguk' | 'ownerclan',
          sourceProductId: p.sourceProductId,
        } satisfies InventorySyncJobData,
      }))
    )

    logger.info(`재고 동기화 ${products.length}건 큐에 추가`)
    return products.length
  } catch (error) {
    logger.error('재고 동기화 폴링 실패', error)
    return 0
  }
}
