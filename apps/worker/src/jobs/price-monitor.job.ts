// =============================================
// 경쟁가 모니터링 및 자동 가격 조정 작업
// - 네이버 쇼핑 Playwright 크롤러로 경쟁가 수집 (robots.txt 자동 준수)
// - 가격 조정 전략 적용 (마진 15% 안전장치 포함)
// - 자동 가격 변경 + 알림
// =============================================

import { Worker, Job } from 'bullmq'
import { createLogger } from '@smartstore/shared'
import { adjustPrice, filterCompetitorPrices, extractSearchKeyword, isPriceChangeAllowed } from '@smartstore/core'
import { naverCommerceApi, updateProductPrice } from '@smartstore/integrations'
import { notificationAdapter } from '@smartstore/adapters'
import { prisma } from '@smartstore/db'
import { naverShoppingCrawler } from '@smartstore/crawlers'
import { QUEUE_NAMES, redisConnection, type PriceMonitorJobData } from '../queues'
import { getSetting } from '../settings-cache'
import { checkCredentialGate, gateSkipResult } from '../credential-gate'

const logger = createLogger('price-monitor-job')

/** 가격 조정 전략 설정 */
const PRICE_STRATEGY = {
  // 경쟁가보다 N원 낮게 설정 (언더컷)
  undercut: 10,
  // 가격 변동이 이 비율 이상일 때만 업데이트 (0.01 = 1%)
  minChangeRatio: 0.01,
  // 크롤러 최대 결과 수
  maxCrawlResults: 5,
}

/**
 * 가격 모니터링 워커
 * - 네이버 쇼핑에서 경쟁가 크롤링
 * - 마진 15% 보장하며 가격 조정
 */
export function createPriceMonitorWorker(): Worker {
  const worker = new Worker<PriceMonitorJobData>(
    QUEUE_NAMES.PRICE_MONITOR,
    async (job: Job<PriceMonitorJobData>) => {
      // Kill Switch: DB 설정 기반 — AUTO_PRICE_ENABLED=false 시 가격 자동 조정 비활성화
      if (getSetting('AUTO_PRICE_ENABLED') !== 'true') {
        logger.warn('AUTO_PRICE_DISABLED')
        return { skipped: true, reason: 'kill-switch' }
      }

      // 자격증명 게이트: 네이버 커머스 필수
      const gate = await checkCredentialGate(['naver_commerce'])
      if (!gate.passed) return gateSkipResult(gate.missing)

      const { productId, naverProductId, currentPrice } = job.data
      logger.info(`가격 모니터링 시작: ${productId}`, { jobId: job.id })

      const jobLog = await prisma.jobLog.create({
        data: {
          jobType: 'price_monitor',
          jobId: job.id ?? '',
          status: 'started',
          payload: { productId, naverProductId, currentPrice },
          startedAt: new Date(),
        },
      })

      try {
        // 1. DB에서 상품 정보 조회
        const product = await prisma.product.findUnique({
          where: { id: productId },
        })

        if (!product || !product.wholesalePrice || !product.shippingFee) {
          throw new Error(`가격 계산에 필요한 상품 정보 누락: ${productId}`)
        }

        // 2. 키워드 정밀화 + 경쟁가 수집
        const searchQuery = extractSearchKeyword(product.name)
        const rawCompetitorPrices = await naverShoppingCrawler.fetchCompetitorPrices(
          searchQuery,
          PRICE_STRATEGY.maxCrawlResults,
        )

        if (rawCompetitorPrices.length === 0) {
          logger.info('경쟁 상품 없음, 가격 유지', { productId, searchQuery })
          return { action: 'no_change', reason: '경쟁 상품 없음' }
        }

        // 3. 이상치 필터링 (중위가 50~200% 범위만 유효)
        const { filtered: competitorPrices, removed, median } = filterCompetitorPrices(rawCompetitorPrices)

        if (removed.length > 0) {
          logger.info('경쟁가 이상치 제거', {
            productId,
            removedCount: removed.length,
            removedPrices: removed.map((p) => p.price),
            median,
          })
        }

        if (competitorPrices.length === 0) {
          logger.info('필터링 후 유효 경쟁가 없음, 가격 유지', { productId, median })
          return { action: 'no_change', reason: '유효 경쟁가 없음' }
        }

        // 4. 경쟁가 DB 저장 (필터링된 유효 가격만)
        await prisma.competitorPrice.createMany({
          data: competitorPrices.map((cp) => ({
            productId,
            competitorName: cp.sellerName,
            competitorPrice: cp.price,
            rank: cp.rank,
          })),
        })

        // 5. 최저 경쟁가 분석
        const lowestCompetitorPrice = Math.min(...competitorPrices.map((p) => p.price))

        logger.info('경쟁가 분석', {
          productId,
          currentPrice,
          lowestCompetitorPrice,
          competitorCount: competitorPrices.length,
        })

        // 5. 최적 판매가 계산 (price-adjuster 모듈 — 마진 15% 안전장치 포함)
        const adjustment = adjustPrice(currentPrice, {
          wholesalePrice: product.wholesalePrice,
          shippingFee: product.shippingFee,
          naverFeeRate: product.naverFeeRate,
          targetMarginRate: product.targetMarginRate,
          lowestCompetitorPrice,
          undercutAmount: PRICE_STRATEGY.undercut,
          minChangeRatio: PRICE_STRATEGY.minChangeRatio,
        })

        // 6. 변동이 의미 없으면 조기 종료
        if (!adjustment.shouldAdjust) {
          logger.info('가격 변동 미미, 업데이트 생략', {
            currentPrice,
            candidatePrice: adjustment.newPrice,
            reason: adjustment.reason,
            blockedByMarginGuard: adjustment.blockedByMarginGuard,
          })

          await prisma.jobLog.update({
            where: { id: jobLog.id },
            data: {
              status: 'completed',
              result: { action: 'no_change', reason: adjustment.reason },
              completedAt: new Date(),
            },
          })

          return { action: 'no_change', reason: adjustment.reason }
        }

        const optimalPrice = adjustment.newPrice

        // 6-1. 가격 변경 안전장치 (price-change-guard)
        //   - 최대 10% 하락 제한
        //   - 하루 최대 2회 변경 제한
        const recentChanges = await prisma.priceHistory.findMany({
          where: {
            productId,
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
          select: { createdAt: true },
        })

        const priceGuard = isPriceChangeAllowed({
          currentPrice,
          newPrice: optimalPrice,
          changesLast24h: recentChanges.length,
        })

        if (!priceGuard.allowed) {
          logger.info('price_change_guard_blocked', {
            productId,
            currentPrice,
            optimalPrice,
            reason: priceGuard.reason,
          })

          await prisma.jobLog.update({
            where: { id: jobLog.id },
            data: {
              status: 'completed',
              result: { action: 'no_change', reason: `guard: ${priceGuard.reason}` },
              completedAt: new Date(),
            },
          })

          return { action: 'no_change', reason: `guard: ${priceGuard.reason}` }
        }

        // 7. 가격 업데이트
        const originProductNo = parseInt(naverProductId, 10)
        const updated = await updateProductPrice(originProductNo, optimalPrice)

        if (!updated) {
          throw new Error('네이버 가격 업데이트 실패')
        }

        // 8. DB 업데이트 (가격 히스토리 + 상품)
        await prisma.$transaction([
          prisma.product.update({
            where: { id: productId },
            data: { salePrice: optimalPrice },
          }),
          prisma.priceHistory.create({
            data: {
              productId,
              oldPrice: currentPrice,
              newPrice: optimalPrice,
              reason: `경쟁가 ${lowestCompetitorPrice.toLocaleString()}원 기반 자동 조정`,
              source: 'competitor',
            },
          }),
        ])

        // 9. 가격 조정 알림
        await notificationAdapter.send({
          type: 'price_adjusted',
          title: `가격 자동 조정`,
          message: [
            `상품: ${product.name}`,
            `변경: ${currentPrice.toLocaleString()}원 → ${optimalPrice.toLocaleString()}원`,
            `최저 경쟁가: ${lowestCompetitorPrice.toLocaleString()}원`,
            `사유: ${adjustment.reason}`,
          ].join('\n'),
          data: { productId, oldPrice: currentPrice, newPrice: optimalPrice },
        })

        await prisma.jobLog.update({
          where: { id: jobLog.id },
          data: {
            status: 'completed',
            result: { oldPrice: currentPrice, newPrice: optimalPrice },
            completedAt: new Date(),
          },
        })

        logger.info('가격 조정 완료', {
          productId,
          oldPrice: currentPrice,
          newPrice: optimalPrice,
        })
        return { action: 'updated', oldPrice: currentPrice, newPrice: optimalPrice }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)

        await prisma.jobLog.update({
          where: { id: jobLog.id },
          data: { status: 'failed', error: message, completedAt: new Date() },
        })

        logger.error('가격 모니터링 실패', { productId, error: message })
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
 * 모든 활성 상품을 가격 모니터링 큐에 추가
 */
export async function enqueueActiveProductsForPriceMonitor(
  priceMonitorQueue: import('bullmq').Queue
): Promise<number> {
  // accountId 기준으로 해당 계정 소속 상품만 조회
  const accountId = process.env['ACCOUNT_ID'] ?? 'default'

  const activeProducts = await prisma.product.findMany({
    where: {
      status: 'active',
      naverProductId: { not: null },
      accountId,
    },
    select: {
      id: true,
      naverProductId: true,
      salePrice: true,
    },
  })

  if (activeProducts.length === 0) {
    logger.info('모니터링 대상 활성 상품 없음', { accountId })
    return 0
  }

  await priceMonitorQueue.addBulk(
    activeProducts.map((p) => ({
      name: 'monitor-price',
      data: {
        productId: p.id,
        naverProductId: p.naverProductId!,
        currentPrice: p.salePrice,
        accountId,
      } as PriceMonitorJobData,
    }))
  )
  logger.info(`${activeProducts.length}개 상품 가격 모니터링 큐에 추가`, { accountId })
  return activeProducts.length
}
