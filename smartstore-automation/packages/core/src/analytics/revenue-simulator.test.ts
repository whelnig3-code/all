// =============================================
// 월 수익 시뮬레이터 단위 테스트
// =============================================

import { simulateMonthlyRevenue } from './revenue-simulator'

const day = (offset: number) => new Date(Date.UTC(2026, 2, 1 + offset))

describe('simulateMonthlyRevenue', () => {
  it('빈 배열 → 모든 값 0', () => {
    const result = simulateMonthlyRevenue([])
    expect(result).toEqual({
      totalOrders: 0,
      totalMarginAmount: 0,
      avgMarginRate: 0,
      projectedMonthlyRevenue: 0,
    })
  })

  it('단일 주문 → totalOrders:1, 마진 합산', () => {
    const result = simulateMonthlyRevenue([
      { marginAmount: 5000, salePrice: 20000, orderedAt: day(0) },
    ])
    expect(result.totalOrders).toBe(1)
    expect(result.totalMarginAmount).toBe(5000)
    expect(result.avgMarginRate).toBeCloseTo(0.25, 4)
  })

  it('marginAmount null 주문 → 집계 제외, totalOrders는 포함', () => {
    const result = simulateMonthlyRevenue([
      { marginAmount: 4000, salePrice: 20000, orderedAt: day(0) },
      { marginAmount: null, salePrice: 15000, orderedAt: day(1) },
    ])
    expect(result.totalOrders).toBe(2)        // 주문 수에는 포함
    expect(result.totalMarginAmount).toBe(4000) // 금액 집계는 제외
  })

  it('다수 주문 → 총 마진 합산 + 평균 마진율 계산', () => {
    const result = simulateMonthlyRevenue([
      { marginAmount: 3000, salePrice: 10000, orderedAt: day(0) },  // 30%
      { marginAmount: 4000, salePrice: 20000, orderedAt: day(5) },  // 20%
      { marginAmount: 5000, salePrice: 25000, orderedAt: day(9) },  // 20%
    ])
    expect(result.totalOrders).toBe(3)
    expect(result.totalMarginAmount).toBe(12000)
    // avgMarginRate = (0.30 + 0.20 + 0.20) / 3 = 0.2333...
    expect(result.avgMarginRate).toBeCloseTo(0.2333, 3)
  })

  it('projectedMonthlyRevenue — 10일 데이터 → 30일 환산', () => {
    // 10일간 10000원 마진 → 하루 1000원 → 월 30000원
    const result = simulateMonthlyRevenue([
      { marginAmount: 5000, salePrice: 20000, orderedAt: day(0) },
      { marginAmount: 5000, salePrice: 20000, orderedAt: day(10) },
    ])
    expect(result.projectedMonthlyRevenue).toBeCloseTo(30000, -2)
  })

  it('단일 날짜 주문들(기간=0) → periodDays=1로 보정', () => {
    const result = simulateMonthlyRevenue([
      { marginAmount: 1000, salePrice: 5000, orderedAt: day(0) },
      { marginAmount: 1000, salePrice: 5000, orderedAt: day(0) },
    ])
    // 총 2000원, 기간 1일 → 월 60000원
    expect(result.projectedMonthlyRevenue).toBe(60000)
  })
})
