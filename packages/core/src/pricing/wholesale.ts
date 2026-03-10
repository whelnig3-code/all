// =============================================
// 위탁판매 가격 계산 엔진
//
// 공식: 판매가 = toPsychPrice((도매가 + 배송비) / (1 - 네이버수수료율 - 목표마진율))
// 심리가격: 1,000원 올림 후 -100원 = X,900원 (예: 19,900원, 6,900원)
// =============================================

import type { WholesalePriceInput, PriceCalculationResult } from '@smartstore/shared'
import {
  validateMarginRate,
  validateWholesalePrice,
  validateSalePrice,
} from '../safety/guards'

/**
 * @deprecated ceilTo10 대신 toPsychPrice 사용. 하위 호환용으로만 유지.
 */
export function ceilTo10(value: number): number {
  return Math.ceil(value / 10) * 10
}

/** 저가 상품 기준 (미만이면 100원 단위) */
const LOW_PRICE_THRESHOLD = 10000

/**
 * 심리가격 변환
 *
 * - 저가 (rawPrice < 10,000원): 100원 올림
 *   예: 3,200 → 3,200원, 5,750 → 5,800원
 *
 * - 고가 (rawPrice >= 10,000원): 1,000원 올림 + 만원 경계 -100원
 *   예: 19,230 → 19,900원, 25,036 → 26,000원
 *
 * 만원 경계 -100원 이유: 20,000→19,900은 "2만원대→1만원대"로 체감 변화
 */
export function toPsychPrice(rawPrice: number): number {
  // 저가 상품: 100원 올림 (1,000원 단위는 가격 손해가 큼)
  if (rawPrice < LOW_PRICE_THRESHOLD) {
    return Math.ceil(rawPrice / 100) * 100
  }

  // 고가 상품: 1,000원 올림
  const ceil1000 = Math.ceil(rawPrice / 1000) * 1000
  // 만원 경계(10,000 배수)에서만 -100원 적용
  if (ceil1000 % 10000 === 0 && (ceil1000 - 100) >= rawPrice) {
    return ceil1000 - 100
  }
  return ceil1000
}

/**
 * 위탁판매 판매가 계산
 *
 * 예시:
 *   도매가 10,000원 + 배송비 2,500원
 *   네이버 수수료 5%, 목표 마진 30%
 *   → 19,240원
 */
export function calculateWholesalePrice(input: WholesalePriceInput): PriceCalculationResult {
  const { wholesalePrice, shippingFee, naverFeeRate, targetMarginRate } = input

  // 입력값 유효성 검증
  validateWholesalePrice(wholesalePrice)
  validateMarginRate(targetMarginRate)

  // 총 원가 = 도매가 + 배송비
  const cost = wholesalePrice + shippingFee

  // 마진 + 네이버 수수료 합산 비율
  const deductionRate = naverFeeRate + targetMarginRate

  if (deductionRate >= 1) {
    throw new Error(
      `네이버 수수료율(${naverFeeRate * 100}%) + 마진율(${targetMarginRate * 100}%)이 100% 이상입니다`
    )
  }

  // 판매가 = 심리가격(원가 / (1 - 차감율)) → X,900원
  const rawPrice = cost / (1 - deductionRate)
  const salePrice = toPsychPrice(rawPrice)

  // 안전장치: 최종 판매가 검증
  validateSalePrice(salePrice)

  // 실제 수익 계산
  const naverFee = Math.round(salePrice * naverFeeRate)
  const margin = salePrice - cost - naverFee
  const actualMarginRate = margin / salePrice

  // 실제 마진율이 목표보다 크게 낮아졌는지 재검증
  validateMarginRate(actualMarginRate)

  return {
    salePrice,
    cost,
    margin,
    marginRate: actualMarginRate,
    naverFee,
  }
}

/**
 * 여러 마진율로 가격 시뮬레이션
 */
export function simulatePrices(
  wholesalePrice: number,
  shippingFee: number,
  naverFeeRate: number,
  marginRates: number[]
): Array<PriceCalculationResult & { targetMarginRate: number }> {
  return marginRates.map(targetMarginRate => {
    const result = calculateWholesalePrice({
      wholesalePrice,
      shippingFee,
      naverFeeRate,
      targetMarginRate,
    })
    return { ...result, targetMarginRate }
  })
}
