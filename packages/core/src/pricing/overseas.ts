// =============================================
// 구매대행 가격 계산 엔진 (Phase 5 준비)
//
// 공식:
//   overseasCost  = 해외원가 × 환율
//   customs       = overseasCost × 관세율
//   vat           = (overseasCost + customs) × 10%
//   totalCost     = overseasCost + 해외배송비 + customs + vat + 국내택배비
//   판매가        = toPsychPrice(totalCost / (1 - 네이버수수료율 - 목표마진율)) → X,900원
//
// CLAUDE.md 예시:
//   $2.50 × 1,200 = 3,000원 | 배송 1,000 | 관세 300 | 부가세 330 | 국내 3,000
//   totalCost = 7,630원
//   판매가 = CEIL(7,630 / 0.65, 10) = 11,740원
//
// 안전장치:
//   마진율 15% 미만 → Error throw (위탁판매와 동일 정책)
// =============================================

import { MIN_MARGIN_RATE } from '../safety/guards'
import { toPsychPrice } from './wholesale'

/** 한국 부가가치세율 (현행 10%) */
const VAT_RATE = 0.1

/** 구매대행 가격 계산 입력 */
export interface OverseasPriceParams {
  /** 해외 원가 (외화 단위 — USD 또는 CNY) */
  overseasPrice: number
  /** 통화 — 계산 공식은 통화에 무관하나, 감사/기록 목적으로 보존 */
  currency: 'USD' | 'CNY'
  /** 적용 환율 (1외화 당 원화, 예: 1300) */
  exchangeRate: number
  /** 해외 배송비 (원) */
  overseasShipFee: number
  /** 관세율 (0~1, 예: 0.10 = 10%) */
  customsRate: number
  /** 국내 택배비 (원) */
  domesticShipFee: number
  /** 네이버 수수료율 (0~1) */
  naverFeeRate: number
  /** 목표 마진율 (0~1) */
  targetMarginRate: number
}

/** 비용 내역 */
export interface OverseasCostBreakdown {
  /** 해외원가 × 환율 (원) */
  overseasCost: number
  /** 해외 배송비 (원) */
  overseasShipFee: number
  /** 관세 = overseasCost × customsRate (원) */
  customs: number
  /** 부가세 = (overseasCost + customs) × 10% (원) */
  vat: number
  /** 국내 택배비 (원) */
  domesticShipFee: number
  /** 총 원가 = overseasCost + overseasShipFee + customs + vat + domesticShipFee (원) */
  totalCost: number
}

/** 구매대행 가격 계산 결과 */
export interface OverseasPriceResult {
  /** 최종 판매가 (심리가격 X,900원, 원) */
  salePrice: number
  /** 실제 마진율 (0~1) */
  marginRate: number
  /** 비용 내역 */
  costBreakdown: OverseasCostBreakdown
}

/**
 * 구매대행 판매가 계산
 *
 * 예시 (CLAUDE.md 기준):
 *   overseasPrice=2.50, currency='USD', exchangeRate=1200,
 *   overseasShipFee=1000, customsRate=0.10, domesticShipFee=3000,
 *   naverFeeRate=0.05, targetMarginRate=0.30
 *   → salePrice=11,740원
 *
 * @throws 마진율이 15% 미만이면 Error
 */
export function calculateOverseasPrice(params: OverseasPriceParams): OverseasPriceResult {
  const {
    overseasPrice,
    exchangeRate,
    overseasShipFee,
    customsRate,
    domesticShipFee,
    naverFeeRate,
    targetMarginRate,
  } = params

  // 1. 원화 환산 원가
  const overseasCost = Math.round(overseasPrice * exchangeRate)

  // 2. 관세 = 원화원가 × 관세율
  const customs = Math.round(overseasCost * customsRate)

  // 3. 부가세 = (원화원가 + 관세) × VAT_RATE
  const vat = Math.round((overseasCost + customs) * VAT_RATE)

  // 4. 총 원가
  const totalCost = overseasCost + overseasShipFee + customs + vat + domesticShipFee

  // 5. 판매가 계산 (심리가격 X,900원)
  const divisor = 1 - naverFeeRate - targetMarginRate
  const rawPrice = totalCost / divisor
  const salePrice = toPsychPrice(rawPrice)

  // 6. 실제 마진율 계산
  const revenue = salePrice * (1 - naverFeeRate)
  const marginRate = (revenue - totalCost) / salePrice

  // 7. 안전장치: 15% 마진 하한선
  if (marginRate < MIN_MARGIN_RATE) {
    throw new Error(
      `마진율 안전장치: ${(marginRate * 100).toFixed(1)}%는 최소 마진율 ` +
      `${(MIN_MARGIN_RATE * 100).toFixed(0)}% 미만입니다. ` +
      `(원가: ${totalCost.toLocaleString()}원, 판매가: ${salePrice.toLocaleString()}원)`
    )
  }

  return {
    salePrice,
    marginRate,
    costBreakdown: {
      overseasCost,
      overseasShipFee,
      customs,
      vat,
      domesticShipFee,
      totalCost,
    },
  }
}
