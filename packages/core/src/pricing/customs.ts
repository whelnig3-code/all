// =============================================
// 관세 계산기 — 한국 관세 규칙 적용
//
// 비유: 공항 세관 심사와 같다.
// 여행자가 면세 한도($150) 이하로 물건을 가져오면 통과,
// 초과하면 물건 종류에 따라 정해진 세율로 세금을 매긴다.
// =============================================

import { createLogger } from '@smartstore/shared'

const logger = createLogger('customs')

// =============================================
// 타입 정의
// =============================================

export interface CustomsInput {
  /** 해외 원가 (원화 환산 후) */
  overseasCostKRW: number
  /** 해외 배송비 (원화) */
  overseasShipFeeKRW: number
  /** 상품 카테고리 (관세율 결정) */
  category?: string
}

export interface CustomsResult {
  /** 적용 관세율 */
  customsRate: number
  /** 면세 여부 */
  dutyFree: boolean
  /** 면세 사유 */
  dutyFreeReason?: string
}

export interface CustomsOptions {
  /** USD 기준 환율 (면세 한도 환산용). 기본 1300 */
  usdReferenceRate?: number
}

// =============================================
// 상수
// =============================================

/** 면세 한도 (미화 달러) */
const DUTY_FREE_LIMIT_USD = 150

/** 기본 USD 기준 환율 */
const DEFAULT_USD_REFERENCE_RATE = 1300

/** 카테고리별 관세율 */
const CATEGORY_RATES: Record<string, number> = {
  '의류/패션': 0.13,
  '전자제품': 0.08,
  '화장품/뷰티': 0.065,
  '식품': 0.08,
}

/** 기본 관세율 */
const DEFAULT_RATE = 0.08

// =============================================
// 관세 계산 함수
// =============================================

/**
 * 관세율 및 면세 여부 계산
 *
 * 규칙:
 * - 물품가격(원가+해외배송비) ≤ $150 상당 → 면세
 * - 초과 시 카테고리별 관세율 적용
 */
export function calculateCustoms(
  input: CustomsInput,
  options: CustomsOptions = {}
): CustomsResult {
  const { overseasCostKRW, overseasShipFeeKRW, category } = input
  const usdReferenceRate = options.usdReferenceRate ?? DEFAULT_USD_REFERENCE_RATE

  const totalValueKRW = overseasCostKRW + overseasShipFeeKRW
  const dutyFreeThresholdKRW = DUTY_FREE_LIMIT_USD * usdReferenceRate

  // 면세 판정: 물품가격이 $150 이하
  if (totalValueKRW <= dutyFreeThresholdKRW) {
    return {
      customsRate: 0,
      dutyFree: true,
      dutyFreeReason: `물품가격 ${totalValueKRW.toLocaleString()}원이 미화 $${DUTY_FREE_LIMIT_USD} (${dutyFreeThresholdKRW.toLocaleString()}원) 이하로 면세`,
    }
  }

  // 과세: 카테고리별 관세율 적용
  const customsRate = category
    ? (CATEGORY_RATES[category] ?? DEFAULT_RATE)
    : DEFAULT_RATE

  if (category === '식품') {
    logger.warn('식품 카테고리: 수입 제한 품목일 수 있음', { category, totalValueKRW })
  }

  return {
    customsRate,
    dutyFree: false,
  }
}
