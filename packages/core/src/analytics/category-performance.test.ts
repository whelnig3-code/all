// =============================================
// 카테고리 성과 분석 테스트 (TDD)
//
// 어떤 카테고리가 가장 잘 팔리는지 분석하여
// 계정별 집중 카테고리를 결정한다.
// =============================================

import {
  analyzeCategoryPerformance,
  rankCategories,
  getRecommendedCategories,
  type ProductPerformanceEntry,
  type CategoryPerformance,
} from './category-performance'

const sampleEntries: readonly ProductPerformanceEntry[] = [
  { category: '주방용품', group: '생활', revenue: 500000, orders: 50, marginRate: 0.25, registeredDays: 30 },
  { category: '주방용품', group: '생활', revenue: 300000, orders: 30, marginRate: 0.20, registeredDays: 60 },
  { category: '욕실용품', group: '생활', revenue: 200000, orders: 20, marginRate: 0.30, registeredDays: 45 },
  { category: '전자기기', group: '테크', revenue: 1000000, orders: 10, marginRate: 0.10, registeredDays: 15 },
  { category: '의류', group: '패션', revenue: 400000, orders: 80, marginRate: 0.35, registeredDays: 90 },
]

describe('analyzeCategoryPerformance', () => {
  it('카테고리별 집계 — 같은 카테고리의 매출/주문 합산', () => {
    const result = analyzeCategoryPerformance(sampleEntries)

    const kitchen = result.find((r) => r.category === '주방용품')
    expect(kitchen).toBeDefined()
    expect(kitchen!.totalRevenue).toBe(800000) // 500000 + 300000
    expect(kitchen!.totalOrders).toBe(80) // 50 + 30
  })

  it('그룹 정보 유지', () => {
    const result = analyzeCategoryPerformance(sampleEntries)

    const kitchen = result.find((r) => r.category === '주방용품')
    expect(kitchen!.group).toBe('생활')
  })

  it('평균 마진율 계산', () => {
    const result = analyzeCategoryPerformance(sampleEntries)

    const kitchen = result.find((r) => r.category === '주방용품')
    // (0.25 + 0.20) / 2 = 0.225
    expect(kitchen!.avgMarginRate).toBeCloseTo(0.225, 3)
  })

  it('평균 일일 매출 계산', () => {
    const result = analyzeCategoryPerformance(sampleEntries)

    const kitchen = result.find((r) => r.category === '주방용품')
    // 주방용품: (500000/30 + 300000/60) / 2 = (16666.67 + 5000) / 2 = 10833.33
    expect(kitchen!.avgDailyRevenue).toBeCloseTo(10833.33, 0)
  })

  it('성과 점수 0~100 범위', () => {
    const result = analyzeCategoryPerformance(sampleEntries)

    for (const perf of result) {
      expect(perf.performanceScore).toBeGreaterThanOrEqual(0)
      expect(perf.performanceScore).toBeLessThanOrEqual(100)
    }
  })

  it('빈 배열 → 빈 결과', () => {
    const result = analyzeCategoryPerformance([])
    expect(result).toEqual([])
  })

  it('단일 항목 카테고리 처리', () => {
    const single: readonly ProductPerformanceEntry[] = [
      { category: '전자기기', group: '테크', revenue: 1000000, orders: 10, marginRate: 0.10, registeredDays: 15 },
    ]
    const result = analyzeCategoryPerformance(single)

    expect(result).toHaveLength(1)
    expect(result[0].totalRevenue).toBe(1000000)
    expect(result[0].totalOrders).toBe(10)
    expect(result[0].avgMarginRate).toBeCloseTo(0.10, 3)
    // 단일 항목일 때 성과 점수는 모든 지표에서 최대 → 100
    expect(result[0].performanceScore).toBe(100)
  })

  it('원본 배열을 변경하지 않음 (불변성)', () => {
    const entries: ProductPerformanceEntry[] = [
      { category: '주방용품', group: '생활', revenue: 500000, orders: 50, marginRate: 0.25, registeredDays: 30 },
    ]
    const copy = JSON.parse(JSON.stringify(entries))
    analyzeCategoryPerformance(entries)
    expect(entries).toEqual(copy)
  })
})

describe('rankCategories', () => {
  it('성과 점수 내림차순 정렬', () => {
    const performances = analyzeCategoryPerformance(sampleEntries)
    const ranked = rankCategories(performances)

    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].performanceScore).toBeGreaterThanOrEqual(ranked[i].performanceScore)
    }
  })

  it('원본 배열을 변경하지 않음 (불변성)', () => {
    const performances = analyzeCategoryPerformance(sampleEntries)
    const copy = [...performances]
    rankCategories(performances)
    expect(performances).toEqual(copy)
  })

  it('빈 배열 → 빈 결과', () => {
    expect(rankCategories([])).toEqual([])
  })
})

describe('getRecommendedCategories', () => {
  it('상위 N개 카테고리 반환', () => {
    const performances = analyzeCategoryPerformance(sampleEntries)
    const top2 = getRecommendedCategories(performances, 2)

    expect(top2).toHaveLength(2)
  })

  it('N이 전체 수보다 크면 전체 반환', () => {
    const performances = analyzeCategoryPerformance(sampleEntries)
    const all = getRecommendedCategories(performances, 100)

    expect(all).toHaveLength(performances.length)
  })

  it('성과 점수 내림차순 정렬', () => {
    const performances = analyzeCategoryPerformance(sampleEntries)
    const top3 = getRecommendedCategories(performances, 3)

    for (let i = 1; i < top3.length; i++) {
      expect(top3[i - 1].performanceScore).toBeGreaterThanOrEqual(top3[i].performanceScore)
    }
  })

  it('N이 0이면 빈 배열 반환', () => {
    const performances = analyzeCategoryPerformance(sampleEntries)
    expect(getRecommendedCategories(performances, 0)).toEqual([])
  })

  it('빈 배열 → 빈 결과', () => {
    expect(getRecommendedCategories([], 5)).toEqual([])
  })
})
