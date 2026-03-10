// =============================================
// 가격대별 동적 마진 엔진 테스트 (TDD — RED)
//
// 마케팅 검증 반영:
//   - 저가 상품(~15,000원): 20% (배송비 적자 방지)
//   - 중가 상품(15,000~30,000원): 15%
//   - 고가 상품(30,000~100,000원): 12%
//   - 프리미엄(100,000원~): 10%
//   - 부스트 모드: 리뷰 50개 미만 → 마진 추가 할인
//   - 절대 최저 금액 가드
// =============================================

import {
  getMinMarginRate,
  getMinAbsoluteProfit,
  validateTieredMargin,
} from './tiered-margin'

describe('getMinMarginRate — 가격대별 최저 마진율', () => {
  describe('기본 모드 (부스트 OFF)', () => {
    it('5,000원 → 20%', () => {
      expect(getMinMarginRate(5000)).toBe(0.20)
    })

    it('10,000원 → 20% (경계값: 15,000 미만)', () => {
      expect(getMinMarginRate(10000)).toBe(0.20)
    })

    it('14,999원 → 20% (경계값: 15,000 직전)', () => {
      expect(getMinMarginRate(14999)).toBe(0.20)
    })

    it('15,000원 → 15% (경계값: 정확히 15,000)', () => {
      expect(getMinMarginRate(15000)).toBe(0.15)
    })

    it('20,000원 → 15%', () => {
      expect(getMinMarginRate(20000)).toBe(0.15)
    })

    it('29,999원 → 15% (경계값: 30,000 직전)', () => {
      expect(getMinMarginRate(29999)).toBe(0.15)
    })

    it('30,000원 → 12% (경계값: 정확히 30,000)', () => {
      expect(getMinMarginRate(30000)).toBe(0.12)
    })

    it('50,000원 → 12%', () => {
      expect(getMinMarginRate(50000)).toBe(0.12)
    })

    it('99,999원 → 12% (경계값: 100,000 직전)', () => {
      expect(getMinMarginRate(99999)).toBe(0.12)
    })

    it('100,000원 → 10% (경계값: 정확히 100,000)', () => {
      expect(getMinMarginRate(100000)).toBe(0.10)
    })

    it('500,000원 → 10%', () => {
      expect(getMinMarginRate(500000)).toBe(0.10)
    })
  })

  describe('부스트 모드 (리뷰 < 50)', () => {
    it('5,000원 부스트 → 15% (기본 20% - 5%)', () => {
      expect(getMinMarginRate(5000, { boostMode: true })).toBe(0.15)
    })

    it('15,000원 부스트 → 12% (기본 15% - 3%)', () => {
      expect(getMinMarginRate(15000, { boostMode: true })).toBe(0.12)
    })

    it('30,000원 부스트 → 9% (기본 12% - 3%)', () => {
      expect(getMinMarginRate(30000, { boostMode: true })).toBe(0.09)
    })

    it('100,000원 부스트 → 8% (기본 10% - 2%)', () => {
      expect(getMinMarginRate(100000, { boostMode: true })).toBe(0.08)
    })
  })
})

describe('getMinAbsoluteProfit — 절대 최저 금액 가드', () => {
  it('~15,000원 → 2,000원', () => {
    expect(getMinAbsoluteProfit(10000)).toBe(2000)
  })

  it('15,000~30,000원 → 2,500원', () => {
    expect(getMinAbsoluteProfit(20000)).toBe(2500)
  })

  it('30,000~100,000원 → 3,500원', () => {
    expect(getMinAbsoluteProfit(50000)).toBe(3500)
  })

  it('100,000원~ → 8,000원', () => {
    expect(getMinAbsoluteProfit(150000)).toBe(8000)
  })
})

describe('validateTieredMargin — 통합 검증', () => {
  it('마진율 충족 + 절대 금액 충족 → 통과', () => {
    // 20,000원 상품, 마진 3,500원 (17.5%) → 15% 충족, 2,500원 충족
    expect(() => validateTieredMargin({
      salePrice: 20000,
      profit: 3500,
    })).not.toThrow()
  })

  it('마진율 미달 → throw', () => {
    // 20,000원 상품, 마진 2,000원 (10%) → 15% 미달
    expect(() => validateTieredMargin({
      salePrice: 20000,
      profit: 2000,
    })).toThrow('마진율')
  })

  it('마진율 충족이지만 절대 금액 미달 → throw', () => {
    // 10,000원 상품, 마진 2,100원 (21%) → 20% 충족, but profit < 2,000원 는 아님
    // 대신: 10,000원 상품, 마진 1,500원 (15%) → 20% 미달
    expect(() => validateTieredMargin({
      salePrice: 10000,
      profit: 1500,
    })).toThrow('마진율')
  })

  it('절대 금액만 미달 (퍼센트는 충족) → throw', () => {
    // 극단 케이스: 5,000원 상품, 마진 1,100원 (22%) → 20% 충족, but 1,100 < 2,000
    expect(() => validateTieredMargin({
      salePrice: 5000,
      profit: 1100,
    })).toThrow('절대 최저')
  })

  it('부스트 모드에서는 낮은 마진 허용', () => {
    // 20,000원, 마진 2,600원 (13%) → 기본 15% 미달, 부스트 12% 충족
    expect(() => validateTieredMargin({
      salePrice: 20000,
      profit: 2600,
      boostMode: true,
    })).not.toThrow()
  })

  it('부스트 모드에서도 절대 금액은 지켜야 함', () => {
    // 5,000원, 마진 900원 (18%) → 부스트 15% 충족, but 900 < 2,000
    expect(() => validateTieredMargin({
      salePrice: 5000,
      profit: 900,
      boostMode: true,
    })).toThrow('절대 최저')
  })

  it('고가 상품 부스트 모드', () => {
    // 100,000원, 마진 8,500원 (8.5%) → 부스트 8% 충족, 8,500 > 8,000 충족
    expect(() => validateTieredMargin({
      salePrice: 100000,
      profit: 8500,
      boostMode: true,
    })).not.toThrow()
  })

  it('0원 이하 판매가 → throw', () => {
    expect(() => validateTieredMargin({
      salePrice: 0,
      profit: 0,
    })).toThrow()
  })

  it('음수 이익 → throw', () => {
    expect(() => validateTieredMargin({
      salePrice: 20000,
      profit: -500,
    })).toThrow()
  })
})
