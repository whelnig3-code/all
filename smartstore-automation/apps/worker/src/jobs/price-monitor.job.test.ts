// =============================================
// 경쟁가 모니터링 워커 테스트 (Phase 4-C)
//
// 검증 항목:
//   1. Kill Switch 동작
//   2. Credential gate 실패
//   3. 상품 정보 누락 (wholesalePrice null) → throw
//   4. 경쟁 상품 없음 → no_change
//   5. adjustPrice.shouldAdjust=false → no_change
//   6. 정상 가격 조정 → updated
//   7. competitorPrice DB 저장
//   8. priceHistory + product $transaction
//   9. 알림 전송
//   10. updateProductPrice 실패 → throw
//   11~12. enqueueActiveProductsForPriceMonitor
// =============================================

import type { Job, Queue } from 'bullmq'
import type { PriceMonitorJobData } from '../queues'

// =============================================
// BullMQ Mock — Worker 프로세서 캡처
// =============================================

let mockCapturedProcessor: ((job: Job<PriceMonitorJobData>) => Promise<unknown>) | null = null

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(
    (_queueName: string, processor: (job: Job<PriceMonitorJobData>) => Promise<unknown>) => {
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

const mockAdjustPrice = jest.fn()

jest.mock('@smartstore/core', () => ({
  adjustPrice: (...args: unknown[]) => mockAdjustPrice(...args),
}))

const mockFetchCompetitorPrices = jest.fn().mockResolvedValue([])

jest.mock('@smartstore/crawlers', () => ({
  naverShoppingCrawler: {
    fetchCompetitorPrices: (...args: unknown[]) => mockFetchCompetitorPrices(...args),
  },
}))

const mockUpdateProductPrice = jest.fn().mockResolvedValue(true)

jest.mock('@smartstore/integrations', () => ({
  naverCommerceApi: {},
  updateProductPrice: (...args: unknown[]) => mockUpdateProductPrice(...args),
}))

const mockNotificationSend = jest.fn().mockResolvedValue(undefined)

jest.mock('@smartstore/adapters', () => ({
  notificationAdapter: {
    send: (...args: unknown[]) => mockNotificationSend(...args),
  },
}))

const mockProductFindUnique = jest.fn()
const mockProductFindMany = jest.fn().mockResolvedValue([])
const mockCompetitorPriceCreateMany = jest.fn().mockResolvedValue({ count: 0 })
const mockJobLogCreate = jest.fn().mockResolvedValue({ id: 'log-1' })
const mockJobLogUpdate = jest.fn().mockResolvedValue({})
const mockTransaction = jest.fn().mockResolvedValue([])

jest.mock('@smartstore/db', () => ({
  prisma: {
    product: {
      findUnique: (...args: unknown[]) => mockProductFindUnique(...args),
      findMany: (...args: unknown[]) => mockProductFindMany(...args),
      update: jest.fn().mockResolvedValue({}),
    },
    competitorPrice: {
      createMany: (...args: unknown[]) => mockCompetitorPriceCreateMany(...args),
    },
    priceHistory: {
      create: jest.fn().mockResolvedValue({}),
    },
    jobLog: {
      create: (...args: unknown[]) => mockJobLogCreate(...args),
      update: (...args: unknown[]) => mockJobLogUpdate(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
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

jest.mock('../queues', () => ({
  QUEUE_NAMES: { PRICE_MONITOR: 'price-monitor' },
}))

const mockGateSkipResult = jest.fn().mockReturnValue({
  skipped: true,
  reason: 'credentials_not_configured',
  missingServices: ['naver_commerce'],
})

jest.mock('../credential-gate', () => ({
  checkCredentialGate: jest.fn().mockResolvedValue({ passed: true, missing: [] }),
  gateSkipResult: (...args: unknown[]) => mockGateSkipResult(...args),
}))

jest.mock('../settings-cache', () => ({
  getSetting: jest.fn().mockReturnValue('true'),
}))

// =============================================
// 테스트
// =============================================

import { createPriceMonitorWorker, enqueueActiveProductsForPriceMonitor } from './price-monitor.job'
import { getSetting } from '../settings-cache'
import { checkCredentialGate } from '../credential-gate'
import * as fs from 'fs'
import * as path from 'path'

/** 기본 상품 데이터 */
const DEFAULT_PRODUCT = {
  id: 'prod-1',
  name: '테스트 상품',
  naverProductId: '12345',
  salePrice: 20000,
  wholesalePrice: 10000,
  shippingFee: 2500,
  naverFeeRate: 0.05,
  targetMarginRate: 0.30,
}

/** 기본 경쟁가 데이터 */
const DEFAULT_COMPETITORS = [
  { sellerName: '경쟁A', price: 19000, rank: 1 },
  { sellerName: '경쟁B', price: 19500, rank: 2 },
]

function makePriceMonitorJob(overrides: Partial<PriceMonitorJobData> = {}): Job<PriceMonitorJobData> {
  return {
    id: 'job-pm-1',
    data: {
      productId: 'prod-1',
      naverProductId: '12345',
      currentPrice: 20000,
      accountId: 'default',
      ...overrides,
    },
  } as Job<PriceMonitorJobData>
}

describe('createPriceMonitorWorker — 경쟁가 모니터링', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCapturedProcessor = null
    ;(getSetting as jest.Mock).mockReturnValue('true')
    ;(checkCredentialGate as jest.Mock).mockResolvedValue({ passed: true, missing: [] })
    mockProductFindUnique.mockResolvedValue(DEFAULT_PRODUCT)
    mockFetchCompetitorPrices.mockResolvedValue(DEFAULT_COMPETITORS)
    mockAdjustPrice.mockReturnValue({
      shouldAdjust: true,
      newPrice: 18990,
      reason: '경쟁가 기반 언더컷',
      blockedByMarginGuard: false,
    })
    mockUpdateProductPrice.mockResolvedValue(true)
  })

  // ---- Kill Switch ----

  it('AUTO_PRICE_ENABLED=false → 스킵', async () => {
    ;(getSetting as jest.Mock).mockReturnValue('false')

    createPriceMonitorWorker()
    const result = await mockCapturedProcessor!(makePriceMonitorJob())

    expect(result).toEqual({ skipped: true, reason: 'kill-switch' })
    expect(mockProductFindUnique).not.toHaveBeenCalled()
  })

  // ---- Credential Gate ----

  it('Credential gate 실패 → gateSkipResult 반환', async () => {
    ;(checkCredentialGate as jest.Mock).mockResolvedValue({ passed: false, missing: ['naver_commerce'] })

    createPriceMonitorWorker()
    const result = await mockCapturedProcessor!(makePriceMonitorJob())

    expect(result).toEqual({
      skipped: true,
      reason: 'credentials_not_configured',
      missingServices: ['naver_commerce'],
    })
    expect(mockProductFindUnique).not.toHaveBeenCalled()
  })

  // ---- 상품 정보 누락 ----

  it('상품 정보 누락 (wholesalePrice null) → throw + jobLog failed', async () => {
    mockProductFindUnique.mockResolvedValue({ ...DEFAULT_PRODUCT, wholesalePrice: null })

    createPriceMonitorWorker()
    await expect(mockCapturedProcessor!(makePriceMonitorJob())).rejects.toThrow('가격 계산에 필요한 상품 정보 누락')

    expect(mockJobLogUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed' }),
      }),
    )
  })

  // ---- 경쟁 상품 없음 ----

  it('경쟁 상품 없음 → no_change', async () => {
    mockFetchCompetitorPrices.mockResolvedValue([])

    createPriceMonitorWorker()
    const result = await mockCapturedProcessor!(makePriceMonitorJob())

    expect(result).toEqual({ action: 'no_change', reason: '경쟁 상품 없음' })
    expect(mockAdjustPrice).not.toHaveBeenCalled()
  })

  // ---- adjustPrice shouldAdjust=false ----

  it('adjustPrice.shouldAdjust=false → no_change + jobLog completed', async () => {
    mockAdjustPrice.mockReturnValue({
      shouldAdjust: false,
      newPrice: 20000,
      reason: '변동 미미',
      blockedByMarginGuard: false,
    })

    createPriceMonitorWorker()
    const result = await mockCapturedProcessor!(makePriceMonitorJob())

    expect(result).toEqual({ action: 'no_change', reason: '변동 미미' })
    expect(mockJobLogUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'completed',
          result: { action: 'no_change', reason: '변동 미미' },
        }),
      }),
    )
    expect(mockUpdateProductPrice).not.toHaveBeenCalled()
  })

  // ---- 정상 가격 조정 ----

  it('정상 가격 조정 → updated', async () => {
    createPriceMonitorWorker()
    const result = await mockCapturedProcessor!(makePriceMonitorJob())

    expect(result).toEqual({ action: 'updated', oldPrice: 20000, newPrice: 18990 })
  })

  // ---- competitorPrice DB 저장 ----

  it('경쟁가 DB 저장 (createMany)', async () => {
    createPriceMonitorWorker()
    await mockCapturedProcessor!(makePriceMonitorJob())

    expect(mockCompetitorPriceCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          productId: 'prod-1',
          competitorName: '경쟁A',
          competitorPrice: 19000,
          rank: 1,
        }),
      ]),
    })
  })

  // ---- priceHistory + product $transaction ----

  it('가격 조정 시 $transaction 호출 (priceHistory + product)', async () => {
    createPriceMonitorWorker()
    await mockCapturedProcessor!(makePriceMonitorJob())

    expect(mockTransaction).toHaveBeenCalledTimes(1)
  })

  // ---- 알림 전송 ----

  it('가격 조정 시 알림 전송', async () => {
    createPriceMonitorWorker()
    await mockCapturedProcessor!(makePriceMonitorJob())

    expect(mockNotificationSend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'price_adjusted',
        message: expect.stringContaining('테스트 상품'),
      }),
    )
  })

  // ---- updateProductPrice 실패 ----

  it('updateProductPrice 실패 → throw + jobLog failed', async () => {
    mockUpdateProductPrice.mockResolvedValue(false)

    createPriceMonitorWorker()
    await expect(mockCapturedProcessor!(makePriceMonitorJob())).rejects.toThrow('네이버 가격 업데이트 실패')

    expect(mockJobLogUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed' }),
      }),
    )
  })
})

// =============================================
// enqueueActiveProductsForPriceMonitor
// =============================================

describe('enqueueActiveProductsForPriceMonitor', () => {
  const mockAddBulk = jest.fn().mockResolvedValue([])
  const mockQueue = { addBulk: mockAddBulk } as unknown as Queue

  beforeEach(() => {
    jest.clearAllMocks()
    process.env['ACCOUNT_ID'] = 'default'
  })

  it('활성 상품 없음 → return 0', async () => {
    mockProductFindMany.mockResolvedValue([])

    const count = await enqueueActiveProductsForPriceMonitor(mockQueue)

    expect(count).toBe(0)
    expect(mockAddBulk).not.toHaveBeenCalled()
  })

  it('상품 3개 → addBulk + return 3', async () => {
    mockProductFindMany.mockResolvedValue([
      { id: 'p1', naverProductId: '111', salePrice: 10000 },
      { id: 'p2', naverProductId: '222', salePrice: 20000 },
      { id: 'p3', naverProductId: '333', salePrice: 30000 },
    ])

    const count = await enqueueActiveProductsForPriceMonitor(mockQueue)

    expect(count).toBe(3)
    expect(mockAddBulk).toHaveBeenCalledTimes(1)
    expect(mockAddBulk).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'monitor-price',
          data: expect.objectContaining({ productId: 'p1' }),
        }),
      ]),
    )
  })
})

// =============================================
// console.log 부재 검증
// =============================================

describe('price-monitor.job.ts — console.log 부재', () => {
  it('소스 파일에 console.log가 없음', () => {
    const filePath = path.resolve(__dirname, './price-monitor.job.ts')
    const source = fs.readFileSync(filePath, 'utf8')
    const consoleUsages = source.match(/console\.(log|warn|error|info)\(/g)
    expect(consoleUsages).toBeNull()
  })
})
