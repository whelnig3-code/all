// =============================================
// daily-report.job 테스트 (TDD — RED first)
// =============================================

import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// Mock 모듈 — 구현 전에 인터페이스만 정의
jest.mock('@smartstore/db', () => ({
  prisma: {
    order: {
      aggregate: jest.fn(),
      count: jest.fn(),
    },
    product: {
      aggregate: jest.fn(),
    },
    jobLog: {
      create: jest.fn().mockResolvedValue({ id: 'jl-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
  },
}))

jest.mock('@smartstore/shared', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
  config: {
    redis: { host: 'localhost', port: 6379 },
    system: { nodeEnv: 'test', port: 3000 },
  },
}))

jest.mock('@smartstore/adapters', () => ({
  notificationAdapter: {
    send: jest.fn().mockResolvedValue(undefined),
  },
}))

jest.mock('../../settings-cache', () => ({
  getSetting: jest.fn().mockReturnValue('true'),
}))

import { prisma } from '@smartstore/db'
import { notificationAdapter } from '@smartstore/adapters'
import { collectDailyMetrics, buildDailyReport } from '../daily-report.job'

describe('collectDailyMetrics', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should aggregate revenue, orders, margin, returns, stock for a given date', async () => {
    const mockOrderAggregate = prisma.order.aggregate as jest.Mock
    const mockOrderCount = prisma.order.count as jest.Mock
    const mockProductAggregate = prisma.product.aggregate as jest.Mock

    // 매출 + 마진
    mockOrderAggregate.mockResolvedValue({
      _sum: { totalAmount: 500000, marginAmount: 75000 },
      _count: { id: 10 },
    })
    // 반품 건수
    mockOrderCount.mockResolvedValue(2)
    // 재고 합계
    mockProductAggregate.mockResolvedValue({
      _sum: { cachedStock: 350 },
    })

    const result = await collectDailyMetrics('2026-03-09', 'default')

    expect(result).toEqual({
      revenue: 500000,
      orders: 10,
      avgMarginRate: 0.15, // 75000 / 500000
      returns: 2,
      stockLevel: 350,
    })
  })

  it('should return zero metrics when no orders exist', async () => {
    const mockOrderAggregate = prisma.order.aggregate as jest.Mock
    const mockOrderCount = prisma.order.count as jest.Mock
    const mockProductAggregate = prisma.product.aggregate as jest.Mock

    mockOrderAggregate.mockResolvedValue({
      _sum: { totalAmount: null, marginAmount: null },
      _count: { id: 0 },
    })
    mockOrderCount.mockResolvedValue(0)
    mockProductAggregate.mockResolvedValue({
      _sum: { cachedStock: 0 },
    })

    const result = await collectDailyMetrics('2026-03-09', 'default')

    expect(result).toEqual({
      revenue: 0,
      orders: 0,
      avgMarginRate: 0,
      returns: 0,
      stockLevel: 0,
    })
  })
})

describe('buildDailyReport', () => {
  it('should include anomalies when detected', () => {
    const today = { revenue: 50000, orders: 2, avgMarginRate: 0.08, returns: 0, stockLevel: 100 }
    const previous = { revenue: 200000, orders: 10, avgMarginRate: 0.15, returns: 0, stockLevel: 100 }

    const report = buildDailyReport(today, previous, '2026-03-09')

    expect(report.date).toBe('2026-03-09')
    expect(report.metrics).toEqual(today)
    expect(report.anomalyResult.hasAnomaly).toBe(true)
    expect(report.anomalyResult.anomalies.length).toBeGreaterThan(0)
    // 매출 75% 하락 → warning 이상
    expect(report.anomalyResult.anomalies[0].type).toBe('revenue_drop')
  })

  it('should report no anomalies for stable metrics', () => {
    const today = { revenue: 100000, orders: 5, avgMarginRate: 0.15, returns: 0, stockLevel: 100 }
    const previous = { revenue: 110000, orders: 6, avgMarginRate: 0.16, returns: 0, stockLevel: 110 }

    const report = buildDailyReport(today, previous, '2026-03-09')

    expect(report.anomalyResult.hasAnomaly).toBe(false)
    expect(report.anomalyResult.anomalies).toHaveLength(0)
  })

  it('should generate notification message with anomaly summary', () => {
    const today = { revenue: 10000, orders: 1, avgMarginRate: 0.05, returns: 5, stockLevel: 10 }
    const previous = { revenue: 200000, orders: 10, avgMarginRate: 0.15, returns: 0, stockLevel: 100 }

    const report = buildDailyReport(today, previous, '2026-03-09')

    expect(report.notificationMessage).toContain('2026-03-09')
    expect(report.notificationMessage).toContain('이상 감지')
  })

  it('should generate normal summary when no anomalies', () => {
    const today = { revenue: 100000, orders: 5, avgMarginRate: 0.15, returns: 0, stockLevel: 100 }
    const previous = { revenue: 100000, orders: 5, avgMarginRate: 0.15, returns: 0, stockLevel: 100 }

    const report = buildDailyReport(today, previous, '2026-03-09')

    expect(report.notificationMessage).toContain('정상')
  })
})
