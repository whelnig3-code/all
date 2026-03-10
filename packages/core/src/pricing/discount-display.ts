// =============================================
// 할인 표시 계산 — "빨간 줄 긋기 효과"
//
// 비유: 마트에서 "원래 15,000원 → 지금 13,500원" 스티커를 붙이면
// 같은 13,500원이라도 더 싸 보인다.
// 재시도로 가격이 낮아진 상품에 이 효과를 자동 적용한다.
//
// 네이버 커머스 API의 customerBenefitInfo.immediateDiscountPolicy로
// 정가 대비 할인가를 표시할 수 있다.
//
// 규칙:
//   - 최소 3% 이상 할인일 때만 표시 (너무 작으면 효과 없음)
//   - 최대 30% 할인 제한 (과도한 할인은 신뢰도 하락)
//   - 할인율은 정수% 단위 (반올림)
// =============================================

/** 할인 표시 여부 판단 입력 */
export interface DiscountCheckInput {
  readonly retryCount: number
  readonly originalPrice: number
  readonly adjustedPrice: number
}

/** 할인 표시 정보 */
export interface DiscountDisplayInfo {
  readonly originalPrice: number
  readonly salePrice: number
  readonly discountAmount: number
  /** 정수% (반올림) */
  readonly discountRate: number
  readonly hasDiscount: boolean
}

/** 할인 표시 최소 기준 (%) */
const MIN_DISCOUNT_RATE = 3

/** 표시용 최대 할인율 (%) — 초과 시 원가를 조정해서 표시 */
const MAX_DISCOUNT_RATE = 30

/**
 * 할인 표시를 해야 하는지 판단
 *
 * 조건:
 *   1. 재시도 상품 (retryCount > 0)
 *   2. 가격이 실제로 낮아짐
 *   3. 할인율 3% 이상
 */
export function shouldShowDiscount(input: DiscountCheckInput): boolean {
  if (input.retryCount <= 0) return false
  if (input.adjustedPrice >= input.originalPrice) return false

  const rate = ((input.originalPrice - input.adjustedPrice) / input.originalPrice) * 100
  return rate >= MIN_DISCOUNT_RATE
}

/**
 * 할인 표시 정보 계산
 *
 * - 할인 없으면 hasDiscount: false
 * - 30% 초과 할인이면 할인율을 30%로 캡 (판매가는 유지)
 */
export function calculateDiscountDisplay(input: {
  readonly originalPrice: number
  readonly adjustedPrice: number
}): DiscountDisplayInfo {
  const { originalPrice, adjustedPrice } = input

  if (adjustedPrice >= originalPrice) {
    return {
      originalPrice,
      salePrice: adjustedPrice,
      discountAmount: 0,
      discountRate: 0,
      hasDiscount: false,
    }
  }

  const rawRate = ((originalPrice - adjustedPrice) / originalPrice) * 100
  const cappedRate = Math.min(Math.round(rawRate), MAX_DISCOUNT_RATE)
  const discountAmount = originalPrice - adjustedPrice

  return {
    originalPrice,
    salePrice: adjustedPrice,
    discountAmount,
    discountRate: cappedRate,
    hasDiscount: true,
  }
}
