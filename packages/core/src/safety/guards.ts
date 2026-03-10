// =============================================
// 안전장치 - 비즈니스 규칙 강제
//
// v2: 가격대별 동적 마진은 tiered-margin.ts에서 처리.
//     이 파일은 절대 최소선(absolute floor)과 상한선만 담당.
//     기존 MIN_MARGIN_RATE=0.15는 부스트모드(10%)보다 높아
//     호환성 위해 유지하되, 실제 가드는 tiered-margin 사용 권장.
// =============================================

/**
 * 절대 최소 마진율: 10% (부스트 모드 최저선)
 * 가격대별 동적 마진은 tiered-margin.ts의 getMinMarginRate() 사용
 * @deprecated 가격대별 동적 마진은 validateTieredMargin() 사용 권장
 */
export const MIN_MARGIN_RATE = 0.10

/** 최대 마진율: 80% (비현실적 가격 방지) */
export const MAX_MARGIN_RATE = 0.80

/** 최소 판매가: 100원 */
export const MIN_SALE_PRICE = 100

/** 최대 판매가: 10,000,000원 (천만원) */
export const MAX_SALE_PRICE = 10_000_000

/**
 * 마진율 안전 검증 (절대 하한/상한)
 * @deprecated 가격대별 동적 마진은 validateTieredMargin() 사용 권장
 */
export function validateMarginRate(rate: number): void {
  if (rate < MIN_MARGIN_RATE) {
    throw new Error(
      `마진율 안전장치: ${(rate * 100).toFixed(1)}%는 최소 마진율 ${(MIN_MARGIN_RATE * 100).toFixed(0)}% 미만입니다. ` +
      `비즈니스 손실 방지를 위해 거래가 차단됩니다.`
    )
  }
  if (rate > MAX_MARGIN_RATE) {
    throw new Error(
      `마진율이 ${(MAX_MARGIN_RATE * 100).toFixed(0)}%를 초과합니다: ${(rate * 100).toFixed(1)}%`
    )
  }
}

/** 판매가 안전 검증 */
export function validateSalePrice(price: number): void {
  if (!Number.isInteger(price)) {
    throw new Error(`판매가는 정수여야 합니다: ${price}`)
  }
  if (price < MIN_SALE_PRICE) {
    throw new Error(`판매가가 최소값(${MIN_SALE_PRICE}원) 미만입니다: ${price}원`)
  }
  if (price > MAX_SALE_PRICE) {
    throw new Error(`판매가가 최대값(${MAX_SALE_PRICE.toLocaleString()}원)을 초과합니다: ${price.toLocaleString()}원`)
  }
}

/** 도매가 안전 검증 */
export function validateWholesalePrice(price: number): void {
  if (price <= 0) {
    throw new Error(`도매가는 0보다 커야 합니다: ${price}`)
  }
}
