// =============================================
// 도매 원가 변동 감지 모듈 단위 테스트
// =============================================

import {
  calcPriceChangeRate,
  isSignificantChange,
  assessMarginRisk,
  detectWholesalePriceChange,
  DEFAULT_CHANGE_THRESHOLD,
} from './wholesale-watcher'

// =============================================
// calcPriceChangeRate
// =============================================

describe('calcPriceChangeRate', () => {
  it('5% 가격 상승을 올바르게 계산한다', () => {
    expect(calcPriceChangeRate(10000, 10500)).toBeCloseTo(0.05)
  })

  it('10% 가격 하락을 음수로 반환한다', () => {
    expect(calcPriceChangeRate(10000, 9000)).toBeCloseTo(-0.1)
  })

  it('가격 변동 없으면 0 반환', () => {
    expect(calcPriceChangeRate(10000, 10000)).toBe(0)
  })

  it('oldPrice가 0이면 0 반환 (divide-by-zero 방지)', () => {
    expect(calcPriceChangeRate(0, 5000)).toBe(0)
  })

  it('oldPrice가 음수면 0 반환', () => {
    expect(calcPriceChangeRate(-1000, 5000)).toBe(0)
  })
})

// =============================================
// isSignificantChange
// =============================================

describe('isSignificantChange', () => {
  it('5% 변동 → 기본 임계값(5%)과 같으므로 significant', () => {
    expect(isSignificantChange(0.05)).toBe(true)
  })

  it('5% 초과 → significant', () => {
    expect(isSignificantChange(0.06)).toBe(true)
  })

  it('4.9% → NOT significant (임계값 미만)', () => {
    expect(isSignificantChange(0.049)).toBe(false)
  })

  it('0% → NOT significant', () => {
    expect(isSignificantChange(0)).toBe(false)
  })

  it('음수 변동(하락)도 절댓값 기준으로 significant 판단', () => {
    expect(isSignificantChange(-0.06)).toBe(true)
    expect(isSignificantChange(-0.04)).toBe(false)
  })

  it('커스텀 임계값 3% 적용', () => {
    expect(isSignificantChange(0.03, 0.03)).toBe(true)
    expect(isSignificantChange(0.029, 0.03)).toBe(false)
  })
})

// =============================================
// assessMarginRisk
// =============================================

describe('assessMarginRisk', () => {
  const baseParams = {
    shippingFee: 2500,
    naverFeeRate: 0.05,
    targetMarginRate: 0.30,
    currentSalePrice: 19240,
  }

  it('원가 급등으로 마진율 15% 미만 → risk=true', () => {
    // 도매가를 매우 높게 설정 → 마진율 붕괴
    const result = assessMarginRisk({
      ...baseParams,
      newWholesalePrice: 18000, // 판매가 19240원에서 마진 거의 없음
    })
    expect(result.risk).toBe(true)
    expect(result.estimatedMarginRate).not.toBeNull()
    expect(result.estimatedMarginRate).toBeLessThan(0.15)
  })

  it('원가 소폭 상승으로 마진율 유지 → risk=false', () => {
    const result = assessMarginRisk({
      ...baseParams,
      newWholesalePrice: 11000, // 판매가 19240에서 충분한 마진
    })
    expect(result.risk).toBe(false)
    expect(result.estimatedMarginRate).toBeGreaterThanOrEqual(0.15)
  })

  it('estimatedMarginRate 수치가 합리적인 범위', () => {
    const result = assessMarginRisk({
      ...baseParams,
      newWholesalePrice: 10000,
    })
    expect(result.estimatedMarginRate).not.toBeNull()
    expect(result.estimatedMarginRate).toBeGreaterThan(0)
    expect(result.estimatedMarginRate).toBeLessThan(1)
  })
})

// =============================================
// detectWholesalePriceChange (통합)
// =============================================

describe('detectWholesalePriceChange', () => {
  const productId = 'test-product-001'
  const marginParams = {
    newWholesalePrice: 12000,
    shippingFee: 2500,
    naverFeeRate: 0.05,
    targetMarginRate: 0.30,
    currentSalePrice: 25000,
  }

  it('5% 이상 상승 → changed=true', () => {
    const result = detectWholesalePriceChange(productId, 10000, 10600)
    expect(result.changed).toBe(true)
    expect(result.changeRate).toBeCloseTo(0.06)
  })

  it('5% 미만 변동 → changed=false', () => {
    const result = detectWholesalePriceChange(productId, 10000, 10400)
    expect(result.changed).toBe(false)
  })

  it('가격 하락 5% 이상 → changed=true (절댓값)', () => {
    const result = detectWholesalePriceChange(productId, 10000, 9400)
    expect(result.changed).toBe(true)
    expect(result.changeRate).toBeCloseTo(-0.06)
  })

  it('changed=false 시 marginRisk=false (마진 체크 불필요)', () => {
    const result = detectWholesalePriceChange(productId, 10000, 10200, marginParams)
    expect(result.changed).toBe(false)
    expect(result.marginRisk).toBe(false)
  })

  it('원가 상승 + 마진 위험 시 marginRisk=true', () => {
    const dangerParams = {
      newWholesalePrice: 16000,
      shippingFee: 2500,
      naverFeeRate: 0.05,
      targetMarginRate: 0.30,
      currentSalePrice: 19240,
    }
    const result = detectWholesalePriceChange(productId, 10000, 16000, dangerParams)
    expect(result.changed).toBe(true)
    expect(result.marginRisk).toBe(true)
  })

  it('원가 하락 시 marginRisk 체크 안 함 (하락은 안전)', () => {
    const result = detectWholesalePriceChange(productId, 10000, 9000, marginParams)
    expect(result.changed).toBe(true)
    expect(result.changeRate).toBeLessThan(0)
    expect(result.marginRisk).toBe(false) // 하락이면 marginRisk 체크 없음
  })

  it('커스텀 임계값 3% 적용', () => {
    const result = detectWholesalePriceChange(productId, 10000, 10350, undefined, 0.03)
    expect(result.changed).toBe(true) // 3.5% > 3% threshold
  })

  it('oldPrice와 newPrice를 결과에 포함', () => {
    const result = detectWholesalePriceChange(productId, 10000, 11000)
    expect(result.oldPrice).toBe(10000)
    expect(result.newPrice).toBe(11000)
  })

  it('DEFAULT_CHANGE_THRESHOLD가 0.05(5%)임을 확인', () => {
    expect(DEFAULT_CHANGE_THRESHOLD).toBe(0.05)
  })
})
