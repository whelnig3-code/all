// =============================================
// review-monitor.job 테스트 (TDD — RED first)
// =============================================

import { describe, it, expect, jest, beforeEach } from '@jest/globals'

jest.mock('@smartstore/db', () => ({
  prisma: {
    product: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn(),
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

jest.mock('@smartstore/integrations', () => ({
  naverCommerceApi: {
    getProductReviewCount: jest.fn().mockResolvedValue(null),
  },
}))

jest.mock('../../settings-cache', () => ({
  getSetting: jest.fn().mockReturnValue('true'),
}))

jest.mock('../../credential-gate', () => ({
  checkCredentialGate: jest.fn().mockResolvedValue({ passed: true, missing: [] }),
  gateSkipResult: jest.fn(),
}))

import { prisma } from '@smartstore/db'
import { shouldActivateBoost, shouldDeactivateBoost, enqueueReviewMonitorProducts } from '../review-monitor.job'

describe('shouldActivateBoost', () => {
  it('should activate boost when review count < 50 and not already active', () => {
    expect(shouldActivateBoost(30, false)).toBe(true)
  })

  it('should not activate boost when already active', () => {
    expect(shouldActivateBoost(30, true)).toBe(false)
  })

  it('should not activate boost when review count >= 50', () => {
    expect(shouldActivateBoost(50, false)).toBe(false)
    expect(shouldActivateBoost(100, false)).toBe(false)
  })
})

describe('shouldDeactivateBoost', () => {
  it('should deactivate boost when review count >= 50 and boost is active', () => {
    expect(shouldDeactivateBoost(50, true)).toBe(true)
    expect(shouldDeactivateBoost(100, true)).toBe(true)
  })

  it('should not deactivate when boost is not active', () => {
    expect(shouldDeactivateBoost(50, false)).toBe(false)
  })

  it('should not deactivate when review count < 50', () => {
    expect(shouldDeactivateBoost(49, true)).toBe(false)
  })
})

describe('enqueueReviewMonitorProducts', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should enqueue active products with naverProductId', async () => {
    const mockFindMany = prisma.product.findMany as jest.Mock
    mockFindMany.mockResolvedValue([
      { id: 'p1', naverProductId: 'nv-1', accountId: 'default' },
      { id: 'p2', naverProductId: 'nv-2', accountId: 'default' },
    ])

    const mockQueue = { add: jest.fn().mockResolvedValue({}) }
    const count = await enqueueReviewMonitorProducts(mockQueue as any)

    expect(count).toBe(2)
    expect(mockQueue.add).toHaveBeenCalledTimes(2)
    expect(mockQueue.add).toHaveBeenCalledWith('review-monitor', {
      productId: 'p1',
      naverProductId: 'nv-1',
      accountId: 'default',
    })
  })

  it('should return 0 when no active products', async () => {
    const mockFindMany = prisma.product.findMany as jest.Mock
    mockFindMany.mockResolvedValue([])

    const mockQueue = { add: jest.fn() }
    const count = await enqueueReviewMonitorProducts(mockQueue as any)

    expect(count).toBe(0)
    expect(mockQueue.add).not.toHaveBeenCalled()
  })
})
