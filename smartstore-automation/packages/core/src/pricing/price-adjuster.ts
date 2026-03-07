// =============================================
// 경쟁가 기반 가격 자동 조정 모듈
//
// 전략:
//   1. 경쟁사 최저가 - undercutAmount = 언더컷 후보가
//   2. 마진 15% 안전장치 (MIN_MARGIN_RATE) 검사
//   3. 통과 → newPrice 반환
//   4. 차단 → shouldAdjust=false, reason에 사유 기술
// =============================================

import { createLogger } from '@smartstore/shared'
import { calculateWholesalePrice } from './wholesale'
import { MIN_MARGIN_RATE } from '../safety/guards'

const logger = createLogger('price-adjuster')

/** 가격 조정 입력 파라미터 */
export interface PriceAdjustInput {
  /** 도매가 (원) */
  wholesalePrice: number
  /** 배송비 (원) */
  shippingFee: number
  /** 네이버 수수료율 (예: 0.05 = 5%) */
  naverFeeRate: number
  /** 목표 마진율 (예: 0.30 = 30%) */
  targetMarginRate: number
  /** 경쟁사 최저가 (원) */
  lowestCompetitorPrice: number
  /** 경쟁가 언더컷 금액 — 기본 10원 */
  undercutAmount?: number
  /** 이 비율 미만 변동은 무시 — 기본 1% */
  minChangeRatio?: number
}

/** 가격 조정 결과 */
export interface PriceAdjustResult {
  /** 가격 변경 여부 */
  shouldAdjust: boolean
  /** 새 판매가 (shouldAdjust=false 이면 현재가 그대로) */
  newPrice: number
  /** 조정 사유 (로그·알림용) */
  reason: string
  /**
   * 마진 안전장치(MIN_MARGIN_RATE 15%)에 의해 언더컷 가격이 차단된 경우 true
   * true여도 shouldAdjust=true일 수 있음 (최소 마진가로 조정되는 경우)
   */
  blockedByMarginGuard: boolean
}

/**
 * 경쟁가 기반 최적 판매가 계산
 *
 * @param currentPrice 현재 판매가 (원)
 * @param input 조정 파라미터
 * @returns PriceAdjustResult
 */
export function adjustPrice(
  currentPrice: number,
  input: PriceAdjustInput
): PriceAdjustResult {
  const {
    wholesalePrice,
    shippingFee,
    naverFeeRate,
    targetMarginRate,
    lowestCompetitorPrice,
    undercutAmount = 10,
    minChangeRatio = 0.01,
  } = input

  // 1. 목표 언더컷 가격: 경쟁사 최저가 - undercutAmount
  const undercutPrice = lowestCompetitorPrice - undercutAmount

  // 2. 최소 마진 보장 가격 (15% 안전장치 — guards.ts MIN_MARGIN_RATE)
  const minMarginResult = calculateWholesalePrice({
    wholesalePrice,
    shippingFee,
    naverFeeRate,
    targetMarginRate: MIN_MARGIN_RATE,
  })

  let candidatePrice: number
  // 마진 안전장치 활성화 여부 (언더컷 가격이 최소 마진가 미만일 때 true)
  let blockedByMarginGuard = false

  if (undercutPrice < minMarginResult.salePrice) {
    // 언더컷 가격이 최소 마진 미충족 → 최소 마진 가격으로 대체 (손실 방지)
    blockedByMarginGuard = true
    logger.warn('언더컷 가격이 최소 마진율 미충족, 최소 마진 가격으로 대체', {
      undercutPrice,
      minMarginPrice: minMarginResult.salePrice,
      minMarginRate: `${(MIN_MARGIN_RATE * 100).toFixed(0)}%`,
    })
    candidatePrice = minMarginResult.salePrice
  } else {
    // 목표 마진 가격 계산 (평소 유지 기준선)
    const targetResult = calculateWholesalePrice({
      wholesalePrice,
      shippingFee,
      naverFeeRate,
      targetMarginRate,
    })

    if (undercutPrice > targetResult.salePrice && lowestCompetitorPrice > currentPrice) {
      // 경쟁가가 현재가보다 높음 → 이미 경쟁력 있는 상황
      // 굳이 낮출 필요 없이 목표 마진가로 수익 극대화
      candidatePrice = targetResult.salePrice
    } else {
      // 경쟁가가 현재가 이하이거나 언더컷 가격이 목표 마진가 이하:
      // 실제 언더컷 가격 사용
      // 10원 단위 엄격 올림: undercutPrice + 1 기준 ceil → 이미 10의 배수여도 다음 단위로 올림
      // 예) 21,990 → Math.ceil(21991/10)*10 = 22,000 (네이버 가격 정책)
      candidatePrice = Math.ceil((undercutPrice + 1) / 10) * 10
    }
  }

  // 3. 변동 임계값 확인 — 1% 미만 변동은 불필요한 API 호출 방지
  const changeRatio = Math.abs(candidatePrice - currentPrice) / currentPrice

  if (changeRatio < minChangeRatio) {
    return {
      shouldAdjust: false,
      newPrice: currentPrice,
      reason: `변동 미미 (${(changeRatio * 100).toFixed(2)}%, 임계값 ${(minChangeRatio * 100).toFixed(0)}% 미만)`,
      blockedByMarginGuard,
    }
  }

  const direction = candidatePrice < currentPrice ? '인하' : '인상'
  const guardNote = blockedByMarginGuard ? ' [margin guard 적용: 최소 마진가로 조정]' : ''

  return {
    shouldAdjust: true,
    newPrice: candidatePrice,
    reason: `경쟁가 ${lowestCompetitorPrice.toLocaleString()}원 기반 자동 ${direction} (언더컷 ${undercutAmount}원)${guardNote}`,
    blockedByMarginGuard,
  }
}
