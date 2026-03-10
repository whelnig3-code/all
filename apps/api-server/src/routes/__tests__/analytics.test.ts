// =============================================
// analytics 라우터 테스트 (TDD — RED first)
// =============================================

import { describe, it, expect, jest, beforeEach } from '@jest/globals'

jest.mock('@smartstore/db', () => ({
  prisma: {
    jobLog: {
      findMany: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
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
    telegram: { botToken: '', chatId: '' },
  },
}))

jest.mock('@smartstore/adapters', () => ({
  notificationAdapter: { send: jest.fn() },
  startBotPolling: jest.fn(),
}))

import { prisma } from '@smartstore/db'
import {
  getRejectionAnalysis,
  getNicheAnalysis,
  getSeoPreview,
} from '../analytics'

describe('getRejectionAnalysis', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return rejection analysis from job logs', async () => {
    const mockFindMany = prisma.jobLog.findMany as jest.Mock
    mockFindMany.mockResolvedValue([
      { id: '1', jobType: 'registration', status: 'completed', result: { skipped: true, reason: 'margin_blocked' }, createdAt: new Date() },
      { id: '2', jobType: 'registration', status: 'completed', result: { skipped: true, reason: 'margin_blocked' }, createdAt: new Date() },
      { id: '3', jobType: 'registration', status: 'completed', result: { skipped: true, reason: 'score_blocked' }, createdAt: new Date() },
      { id: '4', jobType: 'registration', status: 'completed', result: { success: true }, createdAt: new Date() },
    ])

    const result = await getRejectionAnalysis(7)

    expect(result.total).toBe(3)
    expect(result.byReason['margin_blocked']).toBe(2)
    expect(result.byReason['score_blocked']).toBe(1)
    expect(result.topReasons[0].reason).toBe('margin_blocked')
  })

  it('should return empty analysis when no logs exist', async () => {
    const mockFindMany = prisma.jobLog.findMany as jest.Mock
    mockFindMany.mockResolvedValue([])

    const result = await getRejectionAnalysis(7)

    expect(result.total).toBe(0)
    expect(result.topReasons).toHaveLength(0)
  })
})

describe('getNicheAnalysis', () => {
  it('should calculate niche score for a product', () => {
    const result = getNicheAnalysis('보쉬 4인치 그라인더 절단석 10매입', 5000)

    expect(result.isNiche).toBe(true)
    expect(result.score).toBeGreaterThan(0)
    expect(result.score).toBeLessThanOrEqual(100)
  })

  it('should return score 0 for non-niche product', () => {
    const result = getNicheAnalysis('일반 사무용품 A4 복사지', 3000)

    expect(result.isNiche).toBe(false)
    expect(result.score).toBe(0)
  })
})

describe('getSeoPreview', () => {
  it('should return optimized title and search tags', () => {
    const result = getSeoPreview('[무료배송] 최고의 드릴 비트 세트!!!')

    expect(result.optimizedName).not.toContain('무료배송')
    expect(result.optimizedName).not.toContain('!!!')
    expect(result.optimizedName).toContain('드릴')
    expect(result.searchTags.length).toBeGreaterThan(0)
    expect(result.originalLength).toBeGreaterThan(result.optimizedLength)
  })

  it('should handle empty input', () => {
    const result = getSeoPreview('')

    expect(result.optimizedName).toBe('')
    expect(result.searchTags).toHaveLength(0)
  })
})
