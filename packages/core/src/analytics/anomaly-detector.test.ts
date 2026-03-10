// =============================================
// 이상 탐지 테스트 (TDD — Phase C-3)
//
// 매출/마진/재고의 급격한 변동 감지
// =============================================

import { detectAnomalies, type DailyMetrics } from './anomaly-detector'

describe('detectAnomalies', () => {
  const normal: DailyMetrics = {
    revenue: 100000,
    orders: 5,
    avgMarginRate: 0.25,
    returns: 0,
    stockLevel: 50,
  }

  it('정상 데이터 → 이상 없음', () => {
    const result = detectAnomalies(normal, normal)
    expect(result.anomalies).toHaveLength(0)
    expect(result.hasAnomaly).toBe(false)
  })

  it('매출 50% 이상 하락 → 이상 감지', () => {
    const today: DailyMetrics = { ...normal, revenue: 40000 }
    const result = detectAnomalies(today, normal)
    expect(result.hasAnomaly).toBe(true)
    expect(result.anomalies.some((a) => a.type === 'revenue_drop')).toBe(true)
  })

  it('마진율 5%p 이상 하락 → 이상 감지', () => {
    const today: DailyMetrics = { ...normal, avgMarginRate: 0.15 }
    const result = detectAnomalies(today, normal)
    expect(result.hasAnomaly).toBe(true)
    expect(result.anomalies.some((a) => a.type === 'margin_drop')).toBe(true)
  })

  it('반품 급증 (3건 이상) → 이상 감지', () => {
    const today: DailyMetrics = { ...normal, returns: 4 }
    const result = detectAnomalies(today, normal)
    expect(result.hasAnomaly).toBe(true)
    expect(result.anomalies.some((a) => a.type === 'high_returns')).toBe(true)
  })

  it('재고 80% 이상 감소 → 이상 감지', () => {
    const today: DailyMetrics = { ...normal, stockLevel: 5 }
    const result = detectAnomalies(today, normal)
    expect(result.hasAnomaly).toBe(true)
    expect(result.anomalies.some((a) => a.type === 'stock_drop')).toBe(true)
  })

  it('매출 상승 → 이상 아님', () => {
    const today: DailyMetrics = { ...normal, revenue: 200000 }
    const result = detectAnomalies(today, normal)
    expect(result.anomalies.some((a) => a.type === 'revenue_drop')).toBe(false)
  })

  it('이전 데이터 없음 (0) → 이상 감지 안 함', () => {
    const zero: DailyMetrics = { revenue: 0, orders: 0, avgMarginRate: 0, returns: 0, stockLevel: 0 }
    const result = detectAnomalies(normal, zero)
    expect(result.hasAnomaly).toBe(false)
  })

  it('복합 이상 (매출+마진 동시 하락)', () => {
    const today: DailyMetrics = { ...normal, revenue: 30000, avgMarginRate: 0.10 }
    const result = detectAnomalies(today, normal)
    expect(result.anomalies.length).toBeGreaterThanOrEqual(2)
  })
})
