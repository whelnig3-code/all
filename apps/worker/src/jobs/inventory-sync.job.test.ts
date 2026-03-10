// =============================================
// 재고 동기화 워커 테스트
//
// 검증 항목:
//   1. Kill Switch 동작
//   2. 상품 미존재 에러 처리
//   3. 정상 동기화 (DB 업데이트 + InventoryEvent)
//   4. 재고 소진 → pauseListing + 알림
//   5. 재고 부족 → pauseListing + 알림
//   6. 재고 복구 → resumeListing + 알림
//   7. 이미 중지 상태 + 재고 부족 → 중복 중지 안 함
//   8. 크롤러 close() 항상 호출
//   9. pollAndSyncInventory 동작
// =============================================

import type { Job, Queue } from 'bullmq'
import type { InventorySyncJobData } from '../queues'

// =============================================
// BullMQ Mock — Worker 프로세서 캡처
// =============================================

let mockCapturedProcessor: ((job: Job<InventorySyncJobData>) => Promise<unknown>) | null = null

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(
    (_queueName: string, processor: (job: Job<InventorySyncJobData>) => Promise<unknown>) => {
      mockCapturedProcessor = processor
      return { on: jest.fn() }
    },
  ),
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    addBulk: jest.fn(),
    close: jest.fn(),
  })),
}))

// =============================================
// 의존성 Mock
// =============================================

const mockPauseListing = jest.fn().mockResolvedValue({ ok: true })
const mockResumeListing = jest.fn().mockResolvedValue({ ok: true })
const mockIsStockOut = jest.fn().mockReturnValue(false)
const mockIsStockLow = jest.fn().mockReturnValue(false)

jest.mock('@smartstore/core', () => ({
  SAFE_STOCK: 2,
  isStockOut: (...args: unknown[]) => mockIsStockOut(...args),
  isStockLow: (...args: unknown[]) => mockIsStockLow(...args),
  pauseListing: (...args: unknown[]) => mockPauseListing(...args),
  resumeListing: (...args: unknown[]) => mockResumeListing(...args),
}))

const mockCrawlProductDetail = jest.fn()
const mockCrawlerClose = jest.fn().mockResolvedValue(undefined)

jest.mock('@smartstore/crawlers', () => ({
  DomaeggukCrawler: jest.fn().mockImplementation(() => ({
    crawlProductDetail: (...args: unknown[]) => mockCrawlProductDetail(...args),
    close: () => mockCrawlerClose(),
  })),
  OwnerclanCrawler: jest.fn().mockImplementation(() => ({
    crawlProductDetail: (...args: unknown[]) => mockCrawlProductDetail(...args),
    close: () => mockCrawlerClose(),
  })),
}))

const mockProductFindUnique = jest.fn()
const mockProductUpdate = jest.fn().mockResolvedValue({})
const mockProductFindMany = jest.fn().mockResolvedValue([])
const mockInventoryEventCreate = jest.fn().mockResolvedValue({})
const mockJobLogCreate = jest.fn().mockResolvedValue({ id: 'log-1' })
const mockJobLogUpdate = jest.fn().mockResolvedValue({})

jest.mock('@smartstore/db', () => ({
  prisma: {
    product: {
      findUnique: (...args: unknown[]) => mockProductFindUnique(...args),
      findMany: (...args: unknown[]) => mockProductFindMany(...args),
      update: (...args: unknown[]) => mockProductUpdate(...args),
    },
    inventoryEvent: {
      create: (...args: unknown[]) => mockInventoryEventCreate(...args),
    },
    jobLog: {
      create: (...args: unknown[]) => mockJobLogCreate(...args),
      update: (...args: unknown[]) => mockJobLogUpdate(...args),
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
  QUEUE_NAMES: { INVENTORY_SYNC: 'inventory-sync' },
}))

jest.mock('../settings-cache', () => ({
  getSetting: jest.fn().mockReturnValue('true'),
}))

// =============================================
// 테스트
// =============================================

import { createInventorySyncWorker, pollAndSyncInventory } from './inventory-sync.job'
import { getSetting } from '../settings-cache'
import * as fs from 'fs'
import * as path from 'path'

/** 테스트용 Job 객체 생성 */
function makeSyncJob(overrides: Partial<InventorySyncJobData> = {}): Job<InventorySyncJobData> {
  return {
    id: 'job-sync-1',
    data: {
      productId: 'prod-1',
      source: 'domaegguk' as const,
      sourceProductId: 'src-123',
      ...overrides,
    },
  } as Job<InventorySyncJobData>
}

/** 기본 상품 데이터 */
const defaultProduct = {
  id: 'prod-1',
  name: '테스트 상품',
  cachedStock: 10,
  supplierStock: 10,
  reservedStock: 0,
  listingPaused: false,
}

describe('createInventorySyncWorker — 재고 동기화', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCapturedProcessor = null
    ;(getSetting as jest.Mock).mockReturnValue('true')
    mockProductFindUnique.mockResolvedValue({ ...defaultProduct })
    mockCrawlProductDetail.mockResolvedValue({ stockQuantity: 10 })
  })

  // ---- Kill Switch ----

  it('AUTO_INVENTORY_SYNC_ENABLED=false → 스킵', async () => {
    ;(getSetting as jest.Mock).mockReturnValue('false')

    createInventorySyncWorker()
    const result = await mockCapturedProcessor!(makeSyncJob())

    expect(result).toEqual({ skipped: true, reason: 'kill-switch' })
    expect(mockProductFindUnique).not.toHaveBeenCalled()
  })

  // ---- 상품 미존재 ----

  it('상품 없음 → 에러 throw + jobLog failed', async () => {
    mockProductFindUnique.mockResolvedValue(null)

    createInventorySyncWorker()
    await expect(mockCapturedProcessor!(makeSyncJob())).rejects.toThrow('상품을 찾을 수 없습니다')

    expect(mockJobLogUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed' }),
      }),
    )
  })

  // ---- 정상 동기화 ----

  it('정상 동기화 — DB 업데이트 + inventoryEvent 생성', async () => {
    mockCrawlProductDetail.mockResolvedValue({ stockQuantity: 8 })

    createInventorySyncWorker()
    const result = await mockCapturedProcessor!(makeSyncJob())

    expect(result).toEqual({ productId: 'prod-1', supplierStock: 8 })

    // DB 업데이트
    expect(mockProductUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          supplierStock: 8,
          cachedStock: 8,
        }),
      }),
    )

    // InventoryEvent 기록
    expect(mockInventoryEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'sync',
          previousStock: 10,
          newStock: 8,
        }),
      }),
    )

    // jobLog 완료
    expect(mockJobLogUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'completed' }),
      }),
    )
  })

  // ---- 재고 소진 → pauseListing ----

  it('재고 소진 → pauseListing + inventory_out 알림', async () => {
    mockCrawlProductDetail.mockResolvedValue({ stockQuantity: 0 })
    mockIsStockOut.mockReturnValue(true)
    mockIsStockLow.mockReturnValue(true)

    createInventorySyncWorker()
    await mockCapturedProcessor!(makeSyncJob())

    expect(mockPauseListing).toHaveBeenCalledWith('prod-1', expect.stringContaining('재고 소진'))
    expect(mockNotificationSend).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'inventory_out' }),
    )
  })

  // ---- 재고 부족 → pauseListing ----

  it('재고 부족 (SAFE_STOCK 이하) → pauseListing + inventory_low 알림', async () => {
    mockCrawlProductDetail.mockResolvedValue({ stockQuantity: 1 })
    mockIsStockOut.mockReturnValue(false)
    mockIsStockLow.mockReturnValue(true)

    createInventorySyncWorker()
    await mockCapturedProcessor!(makeSyncJob())

    expect(mockPauseListing).toHaveBeenCalledWith('prod-1', expect.stringContaining('안전 재고 이하'))
    expect(mockNotificationSend).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'inventory_low' }),
    )
  })

  // ---- 재고 복구 → resumeListing ----

  it('재고 복구 (paused → 재개) → resumeListing + inventory_recovered 알림', async () => {
    mockProductFindUnique.mockResolvedValue({ ...defaultProduct, listingPaused: true })
    mockCrawlProductDetail.mockResolvedValue({ stockQuantity: 15 })
    mockIsStockOut.mockReturnValue(false)
    mockIsStockLow.mockReturnValue(false)

    createInventorySyncWorker()
    await mockCapturedProcessor!(makeSyncJob())

    expect(mockResumeListing).toHaveBeenCalledWith('prod-1', expect.stringContaining('재고 복구'))
    expect(mockNotificationSend).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'inventory_recovered' }),
    )
  })

  // ---- 이미 중지 + 재고 여전히 부족 → 중복 중지 안 함 ----

  it('이미 판매 중지 + 재고 여전히 부족 → pauseListing 미호출', async () => {
    mockProductFindUnique.mockResolvedValue({ ...defaultProduct, listingPaused: true })
    mockCrawlProductDetail.mockResolvedValue({ stockQuantity: 1 })
    mockIsStockOut.mockReturnValue(false)
    mockIsStockLow.mockReturnValue(true)

    createInventorySyncWorker()
    await mockCapturedProcessor!(makeSyncJob())

    expect(mockPauseListing).not.toHaveBeenCalled()
    expect(mockResumeListing).not.toHaveBeenCalled()
  })

  // ---- 크롤러 close() 항상 호출 ----

  it('크롤러 에러 시에도 close() 호출됨', async () => {
    mockCrawlProductDetail.mockRejectedValue(new Error('크롤러 에러'))

    createInventorySyncWorker()
    await expect(mockCapturedProcessor!(makeSyncJob())).rejects.toThrow('크롤러 에러')

    expect(mockCrawlerClose).toHaveBeenCalled()
  })
})

// =============================================
// pollAndSyncInventory 테스트
// =============================================

describe('pollAndSyncInventory', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getSetting as jest.Mock).mockReturnValue('true')
  })

  it('Kill Switch disabled → return 0', async () => {
    ;(getSetting as jest.Mock).mockReturnValue('false')

    const mockQueue = { addBulk: jest.fn() } as unknown as Queue
    const result = await pollAndSyncInventory(mockQueue)

    expect(result).toBe(0)
    expect(mockQueue.addBulk).not.toHaveBeenCalled()
  })

  it('상품 3개 → addBulk 호출 + return 3', async () => {
    mockProductFindMany.mockResolvedValue([
      { id: 'p1', source: 'domaegguk', sourceProductId: 's1' },
      { id: 'p2', source: 'ownerclan', sourceProductId: 's2' },
      { id: 'p3', source: 'domaegguk', sourceProductId: 's3' },
    ])

    const mockQueue = { addBulk: jest.fn().mockResolvedValue([]) } as unknown as Queue
    const result = await pollAndSyncInventory(mockQueue)

    expect(result).toBe(3)
    expect(mockQueue.addBulk).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ data: expect.objectContaining({ productId: 'p1' }) }),
      ]),
    )
  })

  it('DB 에러 → return 0 (에러 삼킴)', async () => {
    mockProductFindMany.mockRejectedValue(new Error('DB 에러'))

    const mockQueue = { addBulk: jest.fn() } as unknown as Queue
    const result = await pollAndSyncInventory(mockQueue)

    expect(result).toBe(0)
  })
})

// =============================================
// console.log 부재 검증
// =============================================

describe('inventory-sync.job.ts — console.log 부재', () => {
  it('소스 파일에 console.log가 없음', () => {
    const filePath = path.resolve(__dirname, './inventory-sync.job.ts')
    const source = fs.readFileSync(filePath, 'utf8')
    const consoleUsages = source.match(/console\.(log|warn|error|info)\(/g)
    expect(consoleUsages).toBeNull()
  })
})
