// =============================================
// 도매 원가 변동 감지 워커 (P2-A)
//
// 역할:
//   - 크롤링 도매가 vs DB 저장 도매가 비교
//   - 임계값(5%) 초과 시 WholesalePriceWatch 테이블 기록
//   - marginRisk=true 시 Telegram 알림 발송
//   - 원가 상승 + marginRisk 시 판매가 재계산 후 업데이트
// =============================================

import { Worker, Job } from 'bullmq'
import { createLogger } from '@smartstore/shared'
import {
  detectWholesalePriceChange,
  calculateWholesalePrice,
} from '@smartstore/core'
import { updateProductPrice } from '@smartstore/integrations'
import { notificationAdapter } from '@smartstore/adapters'
import { prisma } from '@smartstore/db'
import { QUEUE_NAMES, redisConnection, type WholesaleWatcherJobData } from '../queues'
import { getSetting } from '../settings-cache'

const logger = createLogger('wholesale-watcher-job')

/**
 * 도매 원가 변동 감지 워커
 * - 임계값(기본 5%) 초과 변동 감지 시 기록 및 알림
 * - marginRisk 시 판매가 재계산 후 네이버 상품 가격 업데이트
 */
export function createWholesaleWatcherWorker(): Worker {
  const worker = new Worker<WholesaleWatcherJobData>(
    QUEUE_NAMES.WHOLESALE_WATCHER,
    async (job: Job<WholesaleWatcherJobData>) => {
      // Kill Switch: AUTO_PRICE_ENABLED 기반 (가격 자동 조정 kill switch 공유)
      if (getSetting('AUTO_PRICE_ENABLED') !== 'true') {
        logger.warn('AUTO_PRICE_DISABLED — wholesale watcher 건너뜀')
        return { skipped: true, reason: 'kill-switch' }
      }

      const { productId, currentWholesalePrice, crawledWholesalePrice, accountId } = job.data
      logger.info(`도매 원가 변동 감지 시작: ${productId}`, { jobId: job.id })

      try {
        // 1. DB에서 상품 정보 조회
        const product = await prisma.product.findUnique({
          where: { id: productId },
        })

        if (!product || !product.shippingFee) {
          logger.warn('상품 정보 누락 — 건너뜀', { productId })
          return { skipped: true, reason: 'product_not_found' }
        }

        // 2. 변동 감지
        const marginParams = {
          newWholesalePrice: crawledWholesalePrice,
          shippingFee: product.shippingFee,
          naverFeeRate: product.naverFeeRate,
          targetMarginRate: product.targetMarginRate,
          currentSalePrice: product.salePrice,
        }

        const result = detectWholesalePriceChange(
          productId,
          currentWholesalePrice,
          crawledWholesalePrice,
          marginParams,
        )

        // 3. 임계값 미만 변동이면 종료
        if (!result.changed) {
          logger.info('도매가 변동 미미 — 처리 없음', {
            productId,
            changeRate: `${(result.changeRate * 100).toFixed(1)}%`,
          })
          return { action: 'no_change', changeRate: result.changeRate }
        }

        // 4. 변동 이력 DB 저장
        await prisma.wholesalePriceWatch.create({
          data: {
            productId,
            oldPrice: result.oldPrice,
            newPrice: result.newPrice,
            changeRate: result.changeRate,
            marginRisk: result.marginRisk,
            estimatedMarginRate: result.estimatedNewMarginRate,
          },
        })

        // 5. 원가 상승 + marginRisk: 판매가 재계산 후 업데이트
        if (result.changeRate > 0 && result.marginRisk && product.naverProductId) {
          const newSalePrice = calculateWholesalePrice({
            wholesalePrice: crawledWholesalePrice,
            shippingFee: product.shippingFee,
            naverFeeRate: product.naverFeeRate,
            targetMarginRate: product.targetMarginRate,
          }).salePrice

          const originProductNo = parseInt(product.naverProductId, 10)
          if (isNaN(originProductNo)) {
            logger.warn('naverProductId가 유효하지 않음 — 가격 업데이트 건너뜀', {
              productId,
              naverProductId: product.naverProductId,
            })
            return { action: 'detected', changeRate: result.changeRate, marginRisk: result.marginRisk }
          }
          const updated = await updateProductPrice(originProductNo, newSalePrice)

          if (updated) {
            // 판매가 변경 이력 기록 (source: 'wholesale')
            await prisma.$transaction([
              prisma.product.update({
                where: { id: productId },
                data: {
                  wholesalePrice: crawledWholesalePrice,
                  salePrice: newSalePrice,
                },
              }),
              prisma.priceHistory.create({
                data: {
                  productId,
                  oldPrice: product.salePrice,
                  newPrice: newSalePrice,
                  reason: `도매 원가 ${currentWholesalePrice.toLocaleString()}원 → ${crawledWholesalePrice.toLocaleString()}원 변동`,
                  source: 'wholesale',
                  accountId,
                },
              }),
            ])

            logger.info('도매 원가 상승으로 판매가 재계산 완료', {
              productId,
              oldWholesale: currentWholesalePrice,
              newWholesale: crawledWholesalePrice,
              oldSalePrice: product.salePrice,
              newSalePrice,
            })
          }
        } else if (result.changeRate > 0 && !result.marginRisk) {
          // 원가 상승이지만 마진 안전: DB 도매가만 업데이트
          await prisma.product.update({
            where: { id: productId },
            data: { wholesalePrice: crawledWholesalePrice },
          })
        } else if (result.changeRate < 0) {
          // 원가 하락: 판매가 재계산 (고객에게 유리한 방향)
          if (product.naverProductId) {
            const newSalePrice = calculateWholesalePrice({
              wholesalePrice: crawledWholesalePrice,
              shippingFee: product.shippingFee,
              naverFeeRate: product.naverFeeRate,
              targetMarginRate: product.targetMarginRate,
            }).salePrice

            const originProductNo = parseInt(product.naverProductId, 10)
          if (isNaN(originProductNo)) {
            logger.warn('naverProductId가 유효하지 않음 — 가격 업데이트 건너뜀', {
              productId,
              naverProductId: product.naverProductId,
            })
            return { action: 'detected', changeRate: result.changeRate, marginRisk: result.marginRisk }
          }
            const updated = await updateProductPrice(originProductNo, newSalePrice)

            if (updated) {
              await prisma.$transaction([
                prisma.product.update({
                  where: { id: productId },
                  data: {
                    wholesalePrice: crawledWholesalePrice,
                    salePrice: newSalePrice,
                  },
                }),
                prisma.priceHistory.create({
                  data: {
                    productId,
                    oldPrice: product.salePrice,
                    newPrice: newSalePrice,
                    reason: `도매 원가 하락 ${currentWholesalePrice.toLocaleString()}원 → ${crawledWholesalePrice.toLocaleString()}원`,
                    source: 'wholesale',
                    accountId,
                  },
                }),
              ])
            }
          }
        }

        // 6. 알림 발송
        const directionLabel = result.changeRate > 0 ? '상승' : '하락'
        const urgency = result.marginRisk ? '⚠️ 마진율 위험' : '정보'

        await notificationAdapter.send({
          type: 'wholesale_price_changed',
          title: `도매 원가 ${directionLabel} [${urgency}]`,
          message: [
            `상품ID: ${productId}`,
            `변동: ${currentWholesalePrice.toLocaleString()}원 → ${crawledWholesalePrice.toLocaleString()}원`,
            `변화율: ${(result.changeRate * 100).toFixed(1)}%`,
            result.marginRisk
              ? `⚠️ 추정 마진율: ${result.estimatedNewMarginRate !== null ? (result.estimatedNewMarginRate * 100).toFixed(1) + '%' : '계산불가'} (15% 위반)`
              : '',
          ]
            .filter(Boolean)
            .join('\n'),
          data: { productId, changeRate: result.changeRate, marginRisk: result.marginRisk },
        })

        logger.info('도매 원가 변동 감지 완료', {
          productId,
          changed: result.changed,
          changeRate: `${(result.changeRate * 100).toFixed(1)}%`,
          marginRisk: result.marginRisk,
        })

        return {
          action: 'detected',
          changeRate: result.changeRate,
          marginRisk: result.marginRisk,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error('도매 원가 변동 감지 실패', { productId, error: message })
        throw error
      }
    },
    {
      connection: redisConnection,
      concurrency: 2,
    }
  )

  return worker
}

/**
 * 활성 상품을 도매 원가 변동 감지 큐에 추가
 * - DB 저장 도매가와 크롤링 도매가를 비교하기 위해 crawledPrice 필요
 */
export async function enqueueWholesaleWatcherJobs(
  wholesaleWatcherQueue: import('bullmq').Queue,
  /** 크롤링으로 수집한 도매 원가 (productId → crawledPrice 맵) */
  crawledPrices: Map<string, number>,
): Promise<number> {
  if (crawledPrices.size === 0) {
    logger.info('크롤링 도매가 없음 — 큐 추가 없음')
    return 0
  }

  const accountId = process.env['ACCOUNT_ID'] ?? 'default'
  const productIds = Array.from(crawledPrices.keys())

  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      status: 'active',
      wholesalePrice: { not: null },
      accountId,
    },
    select: { id: true, wholesalePrice: true },
  })

  if (products.length === 0) {
    logger.info('도매가 모니터링 대상 상품 없음', { accountId })
    return 0
  }

  const jobs = products
    .map((p) => {
      const crawledPrice = crawledPrices.get(p.id)
      if (crawledPrice === undefined || p.wholesalePrice === null) return null
      return {
        name: 'watch-wholesale',
        data: {
          productId: p.id,
          currentWholesalePrice: p.wholesalePrice,
          crawledWholesalePrice: crawledPrice,
          accountId,
        } as WholesaleWatcherJobData,
      }
    })
    .filter((j): j is NonNullable<typeof j> => j !== null)

  if (jobs.length > 0) {
    await wholesaleWatcherQueue.addBulk(jobs)
    logger.info(`${jobs.length}개 상품 도매 원가 변동 감지 큐에 추가`, { accountId })
  }

  return jobs.length
}
