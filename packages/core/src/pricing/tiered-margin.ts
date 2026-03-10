// =============================================
// 가격대별 동적 마진 엔진
//
// 마케팅 검증 결과 반영:
//   - 저가 단품은 배송비(3,000원) 때문에 높은 마진 필요
//   - 고가 상품은 절대 금액이 크므로 마진율 낮춰도 OK
//   - 부스트 모드: 리뷰 50개 미만 → 마진 추가 할인 (리뷰 확보 투자)
//   - 절대 최저 금액: 퍼센트 충족해도 이익이 X원 미만이면 차단
// =============================================

/** 가격대별 마진 설정 */
interface MarginTier {
  readonly maxPrice: number       // 이 가격 미만까지 적용
  readonly minMarginRate: number  // 기본 최저 마진율
  readonly boostDiscount: number  // 부스트 모드 할인 폭
  readonly minAbsoluteProfit: number // 절대 최저 이익금
}

/** 가격대별 설정 테이블 (오름차순 정렬 필수) */
const MARGIN_TIERS: readonly MarginTier[] = [
  { maxPrice: 15000,   minMarginRate: 0.20, boostDiscount: 0.05, minAbsoluteProfit: 2000 },
  { maxPrice: 30000,   minMarginRate: 0.15, boostDiscount: 0.03, minAbsoluteProfit: 2500 },
  { maxPrice: 100000,  minMarginRate: 0.12, boostDiscount: 0.03, minAbsoluteProfit: 3500 },
  { maxPrice: Infinity, minMarginRate: 0.10, boostDiscount: 0.02, minAbsoluteProfit: 8000 },
] as const

export interface TieredMarginOptions {
  readonly boostMode?: boolean
}

/**
 * 판매가에 맞는 마진 티어를 찾는다
 */
function findTier(salePrice: number): MarginTier {
  for (const tier of MARGIN_TIERS) {
    if (salePrice < tier.maxPrice) return tier
  }
  return MARGIN_TIERS[MARGIN_TIERS.length - 1]
}

/**
 * 판매가 기준 최저 마진율 반환
 *
 * 비유: 식당 메뉴 가격별로 마진이 다른 것과 같다.
 * 커피(3,000원)는 마진 50%여도 1,500원이지만,
 * 스테이크(50,000원)는 마진 20%면 10,000원. 절대 금액이 다르다.
 */
export function getMinMarginRate(salePrice: number, options?: TieredMarginOptions): number {
  const tier = findTier(salePrice)
  const baseRate = tier.minMarginRate

  if (options?.boostMode) {
    return Math.round((baseRate - tier.boostDiscount) * 100) / 100
  }

  return baseRate
}

/**
 * 판매가 기준 절대 최저 이익금 반환
 */
export function getMinAbsoluteProfit(salePrice: number): number {
  const tier = findTier(salePrice)
  return tier.minAbsoluteProfit
}

/**
 * 통합 마진 검증: 퍼센트 + 절대 금액 동시 체크
 *
 * @throws 마진율 미달 또는 절대 금액 미달 시
 */
export function validateTieredMargin(params: {
  readonly salePrice: number
  readonly profit: number
  readonly boostMode?: boolean
}): void {
  const { salePrice, profit, boostMode } = params

  if (salePrice <= 0) {
    throw new Error('판매가는 0보다 커야 합니다')
  }

  if (profit < 0) {
    throw new Error('이익금이 음수입니다')
  }

  const actualRate = profit / salePrice
  const minRate = getMinMarginRate(salePrice, { boostMode })

  if (actualRate < minRate) {
    const modeLabel = boostMode ? '부스트' : '기본'
    throw new Error(
      `마진율 안전장치(${modeLabel}): ${(actualRate * 100).toFixed(1)}%는 ` +
      `${salePrice.toLocaleString()}원 가격대 최저 마진율 ${(minRate * 100).toFixed(0)}% 미만입니다`
    )
  }

  const minProfit = getMinAbsoluteProfit(salePrice)
  if (profit < minProfit) {
    throw new Error(
      `절대 최저 이익 안전장치: ${profit.toLocaleString()}원은 ` +
      `${salePrice.toLocaleString()}원 가격대 최저 이익 ${minProfit.toLocaleString()}원 미만입니다`
    )
  }
}
