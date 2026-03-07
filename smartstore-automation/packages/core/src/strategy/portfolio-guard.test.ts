// =============================================
// 포트폴리오 비율 제어 단위 테스트
// =============================================

import {
  classifyProductType,
  isPortfolioRatioExceeded,
  getPortfolioPhase,
  TARGET_RATIOS,
} from './portfolio-guard'

describe('classifyProductType', () => {
  it('marginRate >= 35% → experimental', () => {
    expect(classifyProductType(0.35)).toBe('experimental')
    expect(classifyProductType(0.50)).toBe('experimental')
  })

  it('25~35% 미만 → growth', () => {
    expect(classifyProductType(0.25)).toBe('growth')
    expect(classifyProductType(0.30)).toBe('growth')
    expect(classifyProductType(0.349)).toBe('growth')
  })

  it('20~25% 미만 → stable', () => {
    expect(classifyProductType(0.20)).toBe('stable')
    expect(classifyProductType(0.22)).toBe('stable')
    expect(classifyProductType(0.249)).toBe('stable')
  })

  it('20% 미만도 stable (최하위 클램프)', () => {
    expect(classifyProductType(0.15)).toBe('stable')
    expect(classifyProductType(0.10)).toBe('stable')
  })
})

describe('TARGET_RATIOS', () => {
  it('stable 60%, growth 30%, experimental 10%', () => {
    expect(TARGET_RATIOS.stable).toBe(0.60)
    expect(TARGET_RATIOS.growth).toBe(0.30)
    expect(TARGET_RATIOS.experimental).toBe(0.10)
  })

  it('비율 합계 = 1.0', () => {
    const sum = TARGET_RATIOS.stable + TARGET_RATIOS.growth + TARGET_RATIOS.experimental
    expect(sum).toBeCloseTo(1.0)
  })
})

describe('getPortfolioPhase', () => {
  it('0~19 → Phase 1', () => {
    expect(getPortfolioPhase(0)).toBe(1)
    expect(getPortfolioPhase(1)).toBe(1)
    expect(getPortfolioPhase(19)).toBe(1)
  })

  it('20~49 → Phase 2', () => {
    expect(getPortfolioPhase(20)).toBe(2)
    expect(getPortfolioPhase(35)).toBe(2)
    expect(getPortfolioPhase(49)).toBe(2)
  })

  it('50+ → Phase 3', () => {
    expect(getPortfolioPhase(50)).toBe(3)
    expect(getPortfolioPhase(100)).toBe(3)
    expect(getPortfolioPhase(999)).toBe(3)
  })
})

describe('isPortfolioRatioExceeded', () => {
  it('totalCount=0 → false (첫 상품 항상 허용)', () => {
    expect(isPortfolioRatioExceeded('stable', 0, 0)).toBe(false)
    expect(isPortfolioRatioExceeded('experimental', 0, 0)).toBe(false)
  })

  // Phase 3 (totalCount >= 50) — TARGET_RATIOS 전면 적용
  it('[Phase 3] stable 비율 59% → false (60% 미만)', () => {
    expect(isPortfolioRatioExceeded('stable', 59, 100)).toBe(false)
  })

  it('[Phase 3] stable 비율 60% → true (한도 도달)', () => {
    expect(isPortfolioRatioExceeded('stable', 60, 100)).toBe(true)
  })

  it('[Phase 3] growth 비율 29% → false', () => {
    expect(isPortfolioRatioExceeded('growth', 29, 100)).toBe(false)
  })

  it('[Phase 3] growth 비율 30% → true', () => {
    expect(isPortfolioRatioExceeded('growth', 30, 100)).toBe(true)
  })

  it('[Phase 3] experimental 비율 9% → false', () => {
    expect(isPortfolioRatioExceeded('experimental', 9, 100)).toBe(false)
  })

  it('[Phase 3] experimental 비율 10% → true', () => {
    expect(isPortfolioRatioExceeded('experimental', 10, 100)).toBe(true)
  })

  // Phase 1 (totalCount < 20) — 절대 수 제한
  it('[Phase 1] stable은 무제한 허용', () => {
    // 5개 중 2개, 3개 모두 허용
    expect(isPortfolioRatioExceeded('stable', 2, 5)).toBe(false)
    expect(isPortfolioRatioExceeded('stable', 3, 5)).toBe(false)
    expect(isPortfolioRatioExceeded('stable', 15, 19)).toBe(false)
  })

  it('[Phase 1] experimental: 1개 → false, 2개 → true (최대 2)', () => {
    expect(isPortfolioRatioExceeded('experimental', 1, 10)).toBe(false)
    expect(isPortfolioRatioExceeded('experimental', 2, 10)).toBe(true)
    expect(isPortfolioRatioExceeded('experimental', 3, 10)).toBe(true)
  })

  it('[Phase 1] growth: 4개 → false, 5개 → true (최대 5)', () => {
    expect(isPortfolioRatioExceeded('growth', 4, 15)).toBe(false)
    expect(isPortfolioRatioExceeded('growth', 5, 15)).toBe(true)
  })

  // Phase 2 (totalCount 20~49) — 완화된 비율
  it('[Phase 2] stable은 무제한 허용', () => {
    expect(isPortfolioRatioExceeded('stable', 20, 30)).toBe(false)
    expect(isPortfolioRatioExceeded('stable', 40, 49)).toBe(false)
  })

  it('[Phase 2] experimental 9% → false, 10% → true', () => {
    // 2개 / 30개 = 6.7% → false
    expect(isPortfolioRatioExceeded('experimental', 2, 30)).toBe(false)
    // 3개 / 30개 = 10% → true
    expect(isPortfolioRatioExceeded('experimental', 3, 30)).toBe(true)
  })

  it('[Phase 2] growth 29% → false, 30% → true', () => {
    // 8개 / 30개 = 26.7% → false
    expect(isPortfolioRatioExceeded('growth', 8, 30)).toBe(false)
    // 9개 / 30개 = 30% → true
    expect(isPortfolioRatioExceeded('growth', 9, 30)).toBe(true)
  })
})
