// =============================================
// 재고 복구 워커 테스트
//
// 검증 항목:
//   1. Kill Switch 동작
//   2. 상품 미존재 → 스킵
//   3. 이미 판매 중 → 스킵
//   4. 재고 아직 부족 → 스킵
//   5. 재고 복구 → resumeListing + 알림
//   6. resumeListing 실패 → resumed: false
// =============================================

import type { Job } from 'bullmq'
import type { InventoryRecoveryJobData } from '../queues'

// =============================================
// BullMQ Mock
// =============================================

let mockCapturedProcessor: ((job: Job<InventoryRecoveryJobData>) => Promise<unknown>) | null = null

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(
    (_queueName: string, processor: (job: Job<InventoryRecoveryJobData>) => Promise<unknown>) => {
      mockCapturedProcessor = processor
      return { on: jest.fn() }
    },
  ),
}))

// =============================================
// 의존성 Mock
// =============================================

const mockResumeListing = jest.fn().mockResolvedValue({ ok: true })

jest.mock('@smartstore/core', () => ({
  SAFE_STOCK: 2,
  resumeListing: (...args: unknown[]) => mockResumeListing(...args),
}))

const mockProductFindUnique = jest.fn()

jest.mock('@smartstore/db', () => ({
  prisma: {
    product: {
      findUnique: (...args: unknown[]) => mockProductFindUnique(...args),
    },
  },
}))

jest.mock('@smartstore/shared', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
  config: {
    redis: { host: 'localhost', port: 6379, password: undefined },
  },
}))

const mockNotificationSend = jest.fn().mockResolvedValue(undefined)

jest.mock('@smartstore/adapters', () => ({
  notificationAdapter: {
    send: (...args: unknown[]) => mockNotificationSend(...args),
  },
}))

jest.mock('../queues', () => ({
  QUEUE_NAMES: { INVENTORY_RECOVERY: 'inventory-recovery' },
}))

jest.mock('../settings-cache', () => ({
  getSetting: jest.fn().mockReturnValue('true'),
}))

// =============================================
// 테스트
// =============================================

import { createInventoryRecoveryWorker } from './inventory-recovery.job'
import { getSetting } from '../settings-cache'
import * as fs from 'fs'
import * as path from 'path'

function makeRecoveryJob(productId: string = 'prod-1'): Job<InventoryRecoveryJobData> {
  return {
    id: `job-recovery-${productId}`,
    data: { productId },
  } as Job<InventoryRecoveryJobData>
}

describe('createInventoryRecoveryWorker — 재고 복구', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCapturedProcessor = null
    ;(getSetting as jest.Mock).mockReturnValue('true')
  })

  it('Kill Switch disabled → 스킵', async () => {
    ;(getSetting as jest.Mock).mockReturnValue('false')

    createInventoryRecoveryWorker()
    const result = await mockCapturedProcessor!(makeRecoveryJob())

    expect(result).toEqual({ skipped: true, reason: 'kill-switch' })
  })

  it('상품 미존재 → product_not_found 스킵', async () => {
    mockProductFindUnique.mockResolvedValue(null)

    createInventoryRecoveryWorker()
    const result = await mockCapturedProcessor!(makeRecoveryJob())

    expect(result).toEqual({ skipped: true, reason: 'product_not_found' })
  })

  it('이미 판매 중 (not paused) → already_active 스킵', async () => {
    mockProductFindUnique.mockResolvedValue({
      id: 'prod-1', name: '테스트', cachedStock: 10, listingPaused: false,
    })

    createInventoryRecoveryWorker()
    const result = await mockCapturedProcessor!(makeRecoveryJob())

    expect(result).toEqual({ skipped: true, reason: 'already_active' })
  })

  it('재고 아직 부족 (cachedStock <= SAFE_STOCK) → still_low 스킵', async () => {
    mockProductFindUnique.mockResolvedValue({
      id: 'prod-1', name: '테스트', cachedStock: 2, listingPaused: true,
    })

    createInventoryRecoveryWorker()
    const result = await mockCapturedProcessor!(makeRecoveryJob())

    expect(result).toEqual({ skipped: true, reason: 'still_low' })
  })

  it('재고 복구 → resumeListing 성공 + 알림 전송', async () => {
    mockProductFindUnique.mockResolvedValue({
      id: 'prod-1', name: '테스트 상품', cachedStock: 10, listingPaused: true,
    })

    createInventoryRecoveryWorker()
    const result = await mockCapturedProcessor!(makeRecoveryJob())

    expect(result).toEqual({ productId: 'prod-1', resumed: true })
    expect(mockResumeListing).toHaveBeenCalledWith('prod-1', expect.stringContaining('재고 복구'))
    expect(mockNotificationSend).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'inventory_recovered' }),
    )
  })

  it('resumeListing 실패 → resumed: false', async () => {
    mockProductFindUnique.mockResolvedValue({
      id: 'prod-1', name: '테스트', cachedStock: 10, listingPaused: true,
    })
    mockResumeListing.mockResolvedValueOnce({ ok: false, error: new Error('실패') })

    createInventoryRecoveryWorker()
    const result = await mockCapturedProcessor!(makeRecoveryJob())

    expect(result).toEqual({ productId: 'prod-1', resumed: false })
    expect(mockNotificationSend).not.toHaveBeenCalled()
  })
})

describe('inventory-recovery.job.ts — console.log 부재', () => {
  it('소스 파일에 console.log가 없음', () => {
    const filePath = path.resolve(__dirname, './inventory-recovery.job.ts')
    const source = fs.readFileSync(filePath, 'utf8')
    const consoleUsages = source.match(/console\.(log|warn|error|info)\(/g)
    expect(consoleUsages).toBeNull()
  })
})
