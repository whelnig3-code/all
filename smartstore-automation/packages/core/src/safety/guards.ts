// =============================================
// 안전장치 - 비즈니스 규칙 강제 (절대 수정 금지)
// =============================================

/** 최소 마진율: 15% (이 값을 낮추지 말 것) */
export const MIN_MARGIN_RATE = 0.15

/** 최대 마진율: 80% (비현실적 가격 방지) */
export const MAX_MARGIN_RATE = 0.80

/** 최소 판매가: 100원 */
export const MIN_SALE_PRICE = 100

/** 최대 판매가: 10,000,000원 (천만원) */
export const MAX_SALE_PRICE = 10_000_000

/** 마진율 안전 검증 */
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
