// =============================================
// 등록 가드 함수들 (registration.job에서 분리)
//
// 각 가드는 등록 전 검사를 수행하고,
// 차단 시 jobLog를 업데이트하고 skip 결과를 반환
// =============================================

import { createLogger } from '@smartstore/shared'
import {
  calculateProductScore,
  getAccountStrategy,
  isCategoryAllowed,
  isCategoryAllowedForSellerType,
  isProductAllowedForAccount,
  classifyProductType,
  isPortfolioRatioExceeded,
  getPortfolioPhase,
  assertProductUniqueKey,
  calculateExposureScore,
  EXPOSURE_SCORE_THRESHOLD,
  filterCompetitorPrices,
  extractSearchKeyword,
  getMinMarginRate,
} from '@smartstore/core'
import { naverShoppingCrawler } from '@smartstore/crawlers'
import { prisma } from '@smartstore/db'
import { fetchCompetitorCountLimited } from './competitor-limiter'
import { getSetting } from '../settings-cache'

const logger = createLogger('registration-guards')

/** skip 결과 반환용 */
export interface SkipResult {
  skipped: true
  reason: string
  [key: string]: unknown
}

/** 가드 통과 */
export interface PassResult {
  skipped: false
  data: Record<string, unknown>
}

export type GuardResult = SkipResult | PassResult

/** jobLog 업데이트 + skip 결과 생성 헬퍼 */
async function skipWithLog(
  jobLogId: string,
  reason: string,
  extra: Record<string, unknown> = {},
): Promise<SkipResult> {
  await prisma.jobLog.update({
    where: { id: jobLogId },
    data: {
      status: 'completed',
      result: { skipped: true, reason, ...extra },
      completedAt: new Date(),
    },
  })
  return { skipped: true, reason, ...extra }
}

/**
 * 가격대별 동적 마진 검증 (tiered-margin)
 */
export async function checkTieredMargin(
  jobLogId: string,
  productId: string,
  salePrice: number,
  marginRate: number,
  boostMode: boolean,
): Promise<SkipResult | null> {
  const minRate = getMinMarginRate(salePrice, { boostMode })
  if (marginRate < minRate) {
    logger.info('tiered_margin_blocked', { productId, marginRate, minRate, salePrice, boostMode })
    return skipWithLog(jobLogId, 'tiered_margin_blocked', { marginRate, minRate })
  }
  return null
}

/**
 * 계정 전략 검사 (스코어 / 마진율)
 */
export async function checkAccountStrategy(
  jobLogId: string,
  productId: string,
  accountId: string,
  marginRate: number,
  hasNaverCategory: boolean,
): Promise<SkipResult | null> {
  const strategy = getAccountStrategy(accountId)
  const scoreResult = calculateProductScore({ marginRate, hasNaverCategory })

  if (scoreResult.totalScore < strategy.minScore) {
    logger.info('상품 스코어 부족으로 등록 제외', {
      productId, accountId, score: scoreResult.totalScore, minScore: strategy.minScore,
    })
    return skipWithLog(jobLogId, 'score_blocked', { score: scoreResult.totalScore })
  }

  if (marginRate < strategy.minMarginRate) {
    logger.info('margin_blocked', { productId, accountId, marginRate, minMarginRate: strategy.minMarginRate })
    return skipWithLog(jobLogId, 'margin_blocked')
  }

  return null
}

/**
 * 가격 경쟁력 검사 (네이버 최저가 비교)
 * @returns skip 결과 또는 null (통과), lowestPrice
 */
export async function checkPriceCompetitiveness(
  jobLogId: string,
  productId: string,
  productName: string,
  salePrice: number,
): Promise<{ skip: SkipResult | null; lowestPrice: number | null }> {
  const searchQuery = extractSearchKeyword(productName)
  const lowestPrice = await Promise.race([
    naverShoppingCrawler.fetchCompetitorPrices(searchQuery, 5)
      .then((prices) => {
        if (prices.length === 0) return null
        const { filtered } = filterCompetitorPrices(prices)
        return filtered.length > 0 ? Math.min(...filtered.map((p) => p.price)) : null
      }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
  ]).catch(() => null)

  if (lowestPrice !== null && salePrice > lowestPrice) {
    logger.info('price_not_competitive', {
      productId, ourPrice: salePrice, naverLowest: lowestPrice, diff: salePrice - lowestPrice,
    })
    const skip = await skipWithLog(jobLogId, 'price_not_competitive', {
      ourPrice: salePrice, naverLowest: lowestPrice,
    })
    return { skip, lowestPrice }
  }

  if (lowestPrice !== null) {
    logger.info('price_competitive_passed', { productId, ourPrice: salePrice, naverLowest: lowestPrice })
  } else {
    logger.warn('price_check_skipped (timeout/error) — fail-open', { productId })
  }

  return { skip: null, lowestPrice }
}

/**
 * 경쟁사 수 검사
 */
export async function checkCompetitorCount(
  jobLogId: string,
  productId: string,
  accountId: string,
  productName: string,
): Promise<SkipResult | null> {
  const strategy = getAccountStrategy(accountId)
  let competitorCount = await prisma.competitorPrice.count({
    where: { productId },
  })

  if (competitorCount === 0) {
    competitorCount = await fetchCompetitorCountLimited(productName)
    logger.info('competitor_real_check_applied', { productId, competitorCount })
  }

  if (competitorCount > strategy.maxCompetitors) {
    logger.info('competitor_blocked', { productId, accountId, competitorCount, maxCompetitors: strategy.maxCompetitors })
    return skipWithLog(jobLogId, 'competitor_blocked')
  }

  return null
}

/**
 * 노출 가능성 점수 검사 (5초 타임아웃 — fail-open)
 */
export async function checkExposureScore(
  jobLogId: string,
  productId: string,
  accountId: string,
  productName: string,
  salePrice: number,
): Promise<SkipResult | null> {
  const top20 = await Promise.race([
    naverShoppingCrawler.fetchTop20Products(productName),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
  ]).catch(() => null)

  if (top20 !== null) {
    const exposureScore = calculateExposureScore({
      adCount: top20.adCount,
      avgReview: top20.avgReview,
      brandCountTop10: top20.brandCountTop10,
      avgTopPrice: top20.avgTopPrice,
      myPrice: salePrice,
    })

    if (exposureScore < EXPOSURE_SCORE_THRESHOLD) {
      logger.info('exposure_blocked', { productId, accountId, exposureScore, threshold: EXPOSURE_SCORE_THRESHOLD })
      return skipWithLog(jobLogId, 'exposure_blocked', { exposureScore })
    }

    logger.info('exposure_score_passed', { productId, exposureScore })
  } else {
    logger.warn('exposure_check_skipped (timeout/error) — fail-open', { productId })
  }

  return null
}

/**
 * 카테고리 가드 (계정별 + 셀러 유형 + 계정 카테고리 그룹)
 */
export async function checkCategoryGuards(
  jobLogId: string,
  productId: string,
  accountId: string,
  productName: string,
  category: string,
): Promise<SkipResult | null> {
  // 계정별 카테고리 그룹 가드
  const accountCategoryCheck = isProductAllowedForAccount({ accountId, productName })
  if (!accountCategoryCheck.allowed) {
    logger.info('account_category_blocked', {
      productId, accountId, category: accountCategoryCheck.category, group: accountCategoryCheck.group, reason: accountCategoryCheck.reason,
    })
    return skipWithLog(jobLogId, 'account_category_blocked', {
      category: accountCategoryCheck.category, group: accountCategoryCheck.group,
    })
  }

  // 카테고리 허용 검사
  if (!isCategoryAllowed(accountId, category)) {
    logger.info('category_blocked', { productId, accountId, category })
    return skipWithLog(jobLogId, 'category_blocked')
  }

  // 셀러 유형 가드
  const sellerType = getSetting('SELLER_TYPE') === 'business' ? 'business' : 'individual'
  if (!isCategoryAllowedForSellerType(category, sellerType)) {
    logger.info('business_category_blocked', { productId, category, sellerType })
    return skipWithLog(jobLogId, 'business_category_blocked')
  }

  return null
}

/**
 * 포트폴리오 비율 검사
 */
export async function checkPortfolioRatio(
  jobLogId: string,
  productId: string,
  accountId: string,
  marginRate: number,
): Promise<{ skip: SkipResult | null; productType: string }> {
  const productType = classifyProductType(marginRate)
  const [typeCount, totalCount] = await Promise.all([
    prisma.product.count({ where: { accountId, productType, status: 'registered' } }),
    prisma.product.count({ where: { accountId, status: 'registered' } }),
  ])

  const portfolioPhase = getPortfolioPhase(totalCount)
  if (portfolioPhase < 3) {
    logger.info('portfolio_phase_control_applied', { productId, portfolioPhase, totalCount, productType })
  }

  if (isPortfolioRatioExceeded(productType, typeCount, totalCount)) {
    logger.info('portfolio_ratio_blocked', { productId, accountId, productType, typeCount, totalCount })
    return { skip: await skipWithLog(jobLogId, 'portfolio_ratio_blocked'), productType }
  }

  return { skip: null, productType }
}

/**
 * 계정 간 상품 중복 등록 차단
 */
export async function checkDuplicateProduct(
  jobLogId: string,
  productId: string,
  uniqueKey: string | null,
): Promise<SkipResult | null> {
  assertProductUniqueKey(uniqueKey)

  const existing = await prisma.product.findFirst({
    where: { uniqueKey: uniqueKey!, NOT: { id: productId } },
  })

  if (existing) {
    logger.info('cross_account_duplicate_blocked', { productId, uniqueKey, duplicateId: existing.id })
    return skipWithLog(jobLogId, 'cross_account_duplicate_blocked')
  }

  return null
}
