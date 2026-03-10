// =============================================
// 재시도 전략 (Smart Retry Strategy)
//
// 비유: 면접에서 떨어졌을 때의 재도전 전략.
// "연봉 협상 실패(exposure_blocked)"면 희망 연봉을 낮추고,
// "다른 지원자가 더 낮은 연봉 제시(price_not_competitive)"면
// 그보다 약간 낮춘다. 하지만 "최저시급 이하(margin_blocked)"면
// 재도전 자체가 의미 없다.
//
// 사용: 등록 거부된 상품을 가격 조정 후 재등록 큐에 추가
// =============================================

/** 거부 사유 타입 */
export type RejectionReason =
  | 'exposure_blocked'
  | 'price_not_competitive'
  | 'margin_blocked'
  | 'tiered_margin_blocked'
  | 'account_category_blocked'

/** 재시도 가격 계산 입력 */
export interface RetryPriceInput {
  readonly reason: RejectionReason
  readonly currentPrice: number
  readonly competitorPrice?: number
  readonly attemptNumber: number
}

/** 재시도 가격 계산 결과 */
export interface RetryPriceResult {
  readonly adjustedPrice: number
  readonly discountRate: number
}

/** 재시도 가능한 사유 목록 */
const RETRYABLE_REASONS: ReadonlySet<RejectionReason> = new Set([
  'exposure_blocked',
  'price_not_competitive',
])

/** 사유별 최대 재시도 횟수 */
const MAX_RETRY_COUNTS: Readonly<Record<RejectionReason, number>> = {
  exposure_blocked: 3,
  price_not_competitive: 3,
  margin_blocked: 0,
  tiered_margin_blocked: 0,
  account_category_blocked: 0,
}

/** exposure_blocked 할인율 범위 */
const EXPOSURE_MIN_DISCOUNT = 0.05
const EXPOSURE_MAX_DISCOUNT = 0.10

/** price_not_competitive 언더컷 금액 (원) */
const UNDERCUT_AMOUNT = 100

/** fallback 할인율 (경쟁가 없을 때) */
const FALLBACK_DISCOUNT = 0.05

/**
 * 해당 거부 사유가 재시도 가능한지 판단
 *
 * @param reason 거부 사유
 * @returns 재시도 가능 여부
 */
export function shouldRetry(reason: RejectionReason): boolean {
  return RETRYABLE_REASONS.has(reason)
}

/**
 * 거부 사유와 시도 횟수에 따른 재시도 가격 계산
 *
 * - exposure_blocked: 시도 횟수에 비례하여 5~10% 인하
 * - price_not_competitive: 경쟁가 - 100원 (경쟁가 없으면 5% 인하)
 * - 나머지: null (재시도 불가)
 *
 * @param input 재시도 가격 계산 입력
 * @returns 조정된 가격 정보, 재시도 불가 시 null
 */
export function calculateRetryPrice(input: RetryPriceInput): RetryPriceResult | null {
  if (!shouldRetry(input.reason)) {
    return null
  }

  if (input.reason === 'exposure_blocked') {
    return calculateExposureRetryPrice(input)
  }

  if (input.reason === 'price_not_competitive') {
    return calculateCompetitiveRetryPrice(input)
  }

  return null
}

/**
 * 사유별 최대 재시도 횟수 반환
 *
 * @param reason 거부 사유
 * @returns 최대 재시도 횟수 (재시도 불가 사유는 0)
 */
export function getMaxRetryCount(reason: RejectionReason): number {
  return MAX_RETRY_COUNTS[reason]
}

// --- 내부 함수 ---

/** 10원 단위 반올림 */
function roundToTen(price: number): number {
  return Math.round(price / 10) * 10
}

/**
 * exposure_blocked: 시도 횟수에 따라 5~10% 선형 인하
 * 1차: 5%, 2차: 7.5%, 3차: 10%
 */
function calculateExposureRetryPrice(input: RetryPriceInput): RetryPriceResult {
  const maxRetry = MAX_RETRY_COUNTS.exposure_blocked
  const ratio = (input.attemptNumber - 1) / (maxRetry - 1)
  const discountRate = EXPOSURE_MIN_DISCOUNT + (EXPOSURE_MAX_DISCOUNT - EXPOSURE_MIN_DISCOUNT) * ratio
  const adjustedPrice = roundToTen(input.currentPrice * (1 - discountRate))

  return { adjustedPrice, discountRate }
}

/**
 * price_not_competitive: 경쟁가 - 100원, 경쟁가 없으면 5% 인하
 */
function calculateCompetitiveRetryPrice(input: RetryPriceInput): RetryPriceResult {
  if (input.competitorPrice != null) {
    const adjustedPrice = roundToTen(input.competitorPrice - UNDERCUT_AMOUNT)
    const discountRate = (input.currentPrice - adjustedPrice) / input.currentPrice

    return { adjustedPrice, discountRate }
  }

  // 경쟁가 없으면 현재가 5% 인하
  const adjustedPrice = roundToTen(input.currentPrice * (1 - FALLBACK_DISCOUNT))
  const discountRate = FALLBACK_DISCOUNT

  return { adjustedPrice, discountRate }
}
