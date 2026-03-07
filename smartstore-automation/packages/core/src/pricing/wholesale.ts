// =============================================
// 위탁판매 가격 계산 엔진
//
// 공식: 판매가 = CEIL((도매가 + 배송비) / (1 - 네이버수수료율 - 목표마진율), 10원)
// =============================================

import type { WholesalePriceInput, PriceCalculationResult } from '@smartstore/shared'
import {
  validateMarginRate,
  validateWholesalePrice,
  validateSalePrice,
} from '../safety/guards'

/**
 * 10원 단위로 올림 (네이버 가격 정책)
 */
export function ceilTo10(value: number): number {
  return Math.ceil(value / 10) * 10
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

  // 판매가 = CEIL(원가 / (1 - 차감율), 10원)
  const rawPrice = cost / (1 - deductionRate)
  const salePrice = ceilTo10(rawPrice)

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
