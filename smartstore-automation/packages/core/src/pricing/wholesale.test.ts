// =============================================
// 가격 계산 엔진 단위 테스트
// =============================================
import { calculateWholesalePrice, ceilTo10 } from './wholesale'

describe('ceilTo10', () => {
  it('10원 단위로 올림 처리', () => {
    expect(ceilTo10(19230.77)).toBe(19240)
    expect(ceilTo10(100)).toBe(100)
    expect(ceilTo10(101)).toBe(110)
    expect(ceilTo10(19990)).toBe(19990)
    expect(ceilTo10(19991)).toBe(20000)
  })
})

describe('calculateWholesalePrice', () => {
  it('CLAUDE.md 예시 검증: 19,240원', () => {
    const result = calculateWholesalePrice({
      wholesalePrice: 10000,
      shippingFee: 2500,
      naverFeeRate: 0.05,
      targetMarginRate: 0.30,
    })
    expect(result.salePrice).toBe(19240)
  })

  it('판매가 = CEIL(원가 / (1-수수료-마진), 10)', () => {
    const result = calculateWholesalePrice({
      wholesalePrice: 5000,
      shippingFee: 2500,
      naverFeeRate: 0.05,
      targetMarginRate: 0.20,
    })
    // 원가 7500 / (1 - 0.25) = 10000
    expect(result.salePrice).toBe(10000)
    expect(result.cost).toBe(7500)
  })

  it('마진율 15% 미만이면 에러', () => {
    expect(() =>
      calculateWholesalePrice({
        wholesalePrice: 10000,
        shippingFee: 0,
        naverFeeRate: 0.05,
        targetMarginRate: 0.10, // 15% 미만 → 오류
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
