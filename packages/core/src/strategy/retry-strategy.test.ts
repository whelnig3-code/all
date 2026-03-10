// =============================================
// 재시도 전략 단위 테스트
// =============================================

import {
  shouldRetry,
  calculateRetryPrice,
  getMaxRetryCount,
  type RejectionReason,
  type RetryPriceInput,
} from './retry-strategy'

describe('shouldRetry', () => {
  it('exposure_blocked → true (가격 조정으로 해결 가능)', () => {
    expect(shouldRetry('exposure_blocked')).toBe(true)
  })

  it('price_not_competitive → true (경쟁가 대비 조정 가능)', () => {
    expect(shouldRetry('price_not_competitive')).toBe(true)
  })

  it('margin_blocked → false (마진이 이미 부족)', () => {
    expect(shouldRetry('margin_blocked')).toBe(false)
  })

  it('tiered_margin_blocked → false (단계별 마진 기준 미달)', () => {
    expect(shouldRetry('tiered_margin_blocked')).toBe(false)
  })

  it('account_category_blocked → false (계정 카테고리 제한)', () => {
    expect(shouldRetry('account_category_blocked')).toBe(false)
  })
})

describe('calculateRetryPrice', () => {
  describe('exposure_blocked → 5~10% 가격 인하', () => {
    it('첫 번째 재시도: 5% 인하', () => {
      const input: RetryPriceInput = {
        reason: 'exposure_blocked',
        currentPrice: 10000,
        attemptNumber: 1,
      }
      const result = calculateRetryPrice(input)
      expect(result.adjustedPrice).toBe(9500) // 10000 * 0.95
      expect(result.discountRate).toBeCloseTo(0.05)
    })

    it('두 번째 재시도: ~7.5% 인하 (원래 가격 대비)', () => {
      const input: RetryPriceInput = {
        reason: 'exposure_blocked',
        currentPrice: 10000,
        attemptNumber: 2,
      }
      const result = calculateRetryPrice(input)
      // 2차: 5% + (10%-5%) * (2-1)/(3-1) = 5% + 2.5% = 7.5%
      expect(result.adjustedPrice).toBe(9250)
      expect(result.discountRate).toBeCloseTo(0.075)
    })

    it('세 번째 재시도: 10% 인하', () => {
      const input: RetryPriceInput = {
        reason: 'exposure_blocked',
        currentPrice: 10000,
        attemptNumber: 3,
      }
      const result = calculateRetryPrice(input)
      expect(result.adjustedPrice).toBe(9000) // 10000 * 0.90
      expect(result.discountRate).toBeCloseTo(0.10)
    })
  })

  describe('price_not_competitive → 경쟁가 - 100원', () => {
    it('경쟁가보다 100원 낮게 설정', () => {
      const input: RetryPriceInput = {
        reason: 'price_not_competitive',
        currentPrice: 15000,
        competitorPrice: 14500,
        attemptNumber: 1,
      }
      const result = calculateRetryPrice(input)
      expect(result.adjustedPrice).toBe(14400) // 14500 - 100
    })

    it('경쟁가 없으면 현재가 5% 인하로 fallback', () => {
      const input: RetryPriceInput = {
        reason: 'price_not_competitive',
        currentPrice: 15000,
        attemptNumber: 1,
      }
      const result = calculateRetryPrice(input)
      expect(result.adjustedPrice).toBe(14250) // 15000 * 0.95
    })
  })

  describe('재시도 불가 사유 → null 반환', () => {
    it('margin_blocked → null', () => {
      const input: RetryPriceInput = {
        reason: 'margin_blocked',
        currentPrice: 10000,
        attemptNumber: 1,
      }
      expect(calculateRetryPrice(input)).toBeNull()
    })

    it('tiered_margin_blocked → null', () => {
      const input: RetryPriceInput = {
        reason: 'tiered_margin_blocked',
        currentPrice: 10000,
        attemptNumber: 1,
      }
      expect(calculateRetryPrice(input)).toBeNull()
    })

    it('account_category_blocked → null', () => {
      const input: RetryPriceInput = {
        reason: 'account_category_blocked',
        currentPrice: 10000,
        attemptNumber: 1,
      }
      expect(calculateRetryPrice(input)).toBeNull()
    })
  })

  describe('가격 반올림 (1원 단위)', () => {
    it('조정 가격이 정수로 반올림됨', () => {
      const input: RetryPriceInput = {
        reason: 'exposure_blocked',
        currentPrice: 9999,
        attemptNumber: 1,
      }
      const result = calculateRetryPrice(input)
      // 9999 * 0.95 = 9499.05 → 9499 (1원 단위 반올림)
      expect(Number.isInteger(result!.adjustedPrice)).toBe(true)
    })
  })
})

describe('getMaxRetryCount', () => {
  it('exposure_blocked → 3', () => {
    expect(getMaxRetryCount('exposure_blocked')).toBe(3)
  })

  it('price_not_competitive → 3', () => {
    expect(getMaxRetryCount('price_not_competitive')).toBe(3)
  })

  it('margin_blocked → 0 (재시도 불가)', () => {
    expect(getMaxRetryCount('margin_blocked')).toBe(0)
  })

  it('tiered_margin_blocked → 0 (재시도 불가)', () => {
    expect(getMaxRetryCount('tiered_margin_blocked')).toBe(0)
  })

  it('account_category_blocked → 0 (재시도 불가)', () => {
    expect(getMaxRetryCount('account_category_blocked')).toBe(0)
  })
})
