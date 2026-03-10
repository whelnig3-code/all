// =============================================
// 가격 계산 엔진 단위 테스트
// =============================================
import { calculateWholesalePrice, ceilTo10, toPsychPrice } from './wholesale'

describe('ceilTo10 (레거시)', () => {
  it('10원 단위로 올림 처리', () => {
    expect(ceilTo10(19230.77)).toBe(19240)
    expect(ceilTo10(100)).toBe(100)
    expect(ceilTo10(101)).toBe(110)
    expect(ceilTo10(19990)).toBe(19990)
    expect(ceilTo10(19991)).toBe(20000)
  })
})

describe('toPsychPrice', () => {
  it('만원 경계에서 -100원 적용 (19,900원, 29,900원)', () => {
    // 19,230 → ceil(20,000) → 만원 경계 → 19,900
    expect(toPsychPrice(19230.77)).toBe(19900)
    // 29,100 → ceil(30,000) → 만원 경계 → 29,900
    expect(toPsychPrice(29100)).toBe(29900)
    // 9,500 → 저가(< 10,000) → 100원 올림 → 9,500
    expect(toPsychPrice(9500)).toBe(9500)
  })

  it('고가 상품: 만원 경계가 아니면 1,000원 올림 그대로', () => {
    // 25,036 → ceil(26,000) → 경계 아님 → 26,000
    expect(toPsychPrice(25036)).toBe(26000)
    // 13,200 → ceil(14,000) → 경계 아님 → 14,000
    expect(toPsychPrice(13200)).toBe(14000)
    // 22,158 → ceil(23,000) → 경계 아님 → 23,000
    expect(toPsychPrice(22158)).toBe(23000)
  })

  it('고가: 정확히 만원 경계일 때 -100원이 rawPrice 미만이면 그대로', () => {
    // 10,000 → ceil(10,000) → 만원 경계 → 9,900? (< 10,000) → 10,000
    expect(toPsychPrice(10000)).toBe(10000)
    // 20,000 → ceil(20,000) → 만원 경계 → 19,900? (< 20,000) → 20,000
    expect(toPsychPrice(20000)).toBe(20000)
  })

  it('만원 경계 직전이면 -100원 적용', () => {
    // 19,800 → ceil(20,000) → 만원 경계 → 19,900 (>= 19,800) → 19,900
    expect(toPsychPrice(19800)).toBe(19900)
  })

  it('저가 상품 (rawPrice < 10,000): 100원 올림', () => {
    // 3,200 → ceil100(3,200) = 3,200
    expect(toPsychPrice(3200)).toBe(3200)
    // 5,750 → ceil100(5,800)
    expect(toPsychPrice(5750)).toBe(5800)
    // 4,321 → ceil100(4,400)
    expect(toPsychPrice(4321)).toBe(4400)
    // 9,999 → ceil100(10,000) — 10,000 미만 입력이지만 결과는 10,000
    expect(toPsychPrice(9999)).toBe(10000)
    // 2,100 → ceil100(2,100)
    expect(toPsychPrice(2100)).toBe(2100)
    // 소수점: 8,450.5 → ceil100(8,500)
    expect(toPsychPrice(8450.5)).toBe(8500)
  })

  it('고가 상품 (rawPrice >= 10,000): 기존 1,000원 올림', () => {
    // 10,000 → ceil1000(10,000) → 만원 경계 → 9,900? (< 10,000) → 10,000
    expect(toPsychPrice(10000)).toBe(10000)
    // 10,500 → ceil1000(11,000) → 경계 아님 → 11,000
    expect(toPsychPrice(10500)).toBe(11000)
    // 25,036 → ceil1000(26,000) → 경계 아님 → 26,000
    expect(toPsychPrice(25036)).toBe(26000)
  })
})

describe('calculateWholesalePrice', () => {
  it('만원 경계: 도매가 10,000 + 배송비 2,500 = 19,900원', () => {
    const result = calculateWholesalePrice({
      wholesalePrice: 10000,
      shippingFee: 2500,
      naverFeeRate: 0.05,
      targetMarginRate: 0.30,
    })
    // rawPrice = 12,500 / 0.65 = 19,230.77 → ceil(20,000) → 만원 경계 → 19,900
    expect(result.salePrice).toBe(19900)
  })

  it('만원 경계 아닌 경우: 1,000원 올림', () => {
    const result = calculateWholesalePrice({
      wholesalePrice: 5000,
      shippingFee: 2500,
      naverFeeRate: 0.05,
      targetMarginRate: 0.20,
    })
    // 원가 7,500 / 0.75 = 10,000 → ceil(10,000) → 만원 경계 → 9,900? (< 10,000) → 10,000
    expect(result.salePrice).toBe(10000)
    expect(result.cost).toBe(7500)
  })

  it('마진율 10% 미만이면 에러 (absolute floor, 가격대별 동적 마진은 tiered-margin 담당)', () => {
    expect(() =>
      calculateWholesalePrice({
        wholesalePrice: 10000,
        shippingFee: 0,
        naverFeeRate: 0.05,
        targetMarginRate: 0.05, // 10% 미만 → 오류
      })
    ).toThrow('안전장치')
  })

  it('도매가 0 이하이면 에러', () => {
    expect(() =>
      calculateWholesalePrice({
        wholesalePrice: 0,
        shippingFee: 0,
        naverFeeRate: 0.05,
        targetMarginRate: 0.30,
      })
    ).toThrow()
  })
})
