// =============================================
// 할인 표시 계산 테스트 (TDD — RED first)
//
// 재시도로 가격이 낮아진 상품에 할인 태그를 표시.
// 고객 입장에서 "15,000원 → 13,500원 (10% 할인)" 이 보이면
// 더 매력적으로 느낀다.
// =============================================

import {
  calculateDiscountDisplay,
  shouldShowDiscount,
  type DiscountDisplayInfo,
} from './discount-display'

describe('shouldShowDiscount', () => {
  it('재시도 상품(retryCount > 0) + 가격 인하 → true', () => {
    expect(shouldShowDiscount({
      retryCount: 1,
      originalPrice: 15000,
      adjustedPrice: 13500,
    })).toBe(true)
  })

  it('최초 등록(retryCount 0) → false', () => {
    expect(shouldShowDiscount({
      retryCount: 0,
      originalPrice: 15000,
      adjustedPrice: 15000,
    })).toBe(false)
  })

  it('가격 동일 → false', () => {
    expect(shouldShowDiscount({
      retryCount: 1,
      originalPrice: 15000,
      adjustedPrice: 15000,
    })).toBe(false)
  })

  it('가격이 오히려 올랐으면 → false', () => {
    expect(shouldShowDiscount({
      retryCount: 1,
      originalPrice: 15000,
      adjustedPrice: 16000,
    })).toBe(false)
  })

  it('할인율 3% 미만 → false (너무 작은 할인은 표시 안 함)', () => {
    expect(shouldShowDiscount({
      retryCount: 1,
      originalPrice: 10000,
      adjustedPrice: 9800, // 2% 할인
    })).toBe(false)
  })

  it('할인율 3% 이상 → true', () => {
    expect(shouldShowDiscount({
      retryCount: 1,
      originalPrice: 10000,
      adjustedPrice: 9500, // 5% 할인
    })).toBe(true)
  })
})

describe('calculateDiscountDisplay', () => {
  it('정상 할인 정보 계산', () => {
    const result = calculateDiscountDisplay({
      originalPrice: 15000,
      adjustedPrice: 13500,
    })

    expect(result.originalPrice).toBe(15000)
    expect(result.salePrice).toBe(13500)
    expect(result.discountAmount).toBe(1500)
    expect(result.discountRate).toBe(10) // 10%
    expect(result.hasDiscount).toBe(true)
  })

  it('5% 할인', () => {
    const result = calculateDiscountDisplay({
      originalPrice: 20000,
      adjustedPrice: 19000,
    })

    expect(result.discountRate).toBe(5)
    expect(result.discountAmount).toBe(1000)
    expect(result.hasDiscount).toBe(true)
  })

  it('할인 없음 (동일 가격)', () => {
    const result = calculateDiscountDisplay({
      originalPrice: 15000,
      adjustedPrice: 15000,
    })

    expect(result.hasDiscount).toBe(false)
    expect(result.discountRate).toBe(0)
    expect(result.discountAmount).toBe(0)
  })

  it('할인율 소수점 반올림 (정수%)', () => {
    const result = calculateDiscountDisplay({
      originalPrice: 15000,
      adjustedPrice: 13900, // 7.333...%
    })

    expect(result.discountRate).toBe(7) // 반올림
  })

  it('최대 할인율 30% 제한', () => {
    const result = calculateDiscountDisplay({
      originalPrice: 20000,
      adjustedPrice: 10000, // 50% 할인 시도
    })

    // 30% 캡 적용 → salePrice는 그대로지만 표시용 원가를 조정
    expect(result.discountRate).toBeLessThanOrEqual(30)
    expect(result.salePrice).toBe(10000) // 실제 판매가는 유지
  })
})
