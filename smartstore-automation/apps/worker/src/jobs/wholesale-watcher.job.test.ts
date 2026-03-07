// =============================================
// 도매 원가 변동 감지 워커 테스트 (Phase 4-C)
//
// 검증 항목:
//   1. Kill Switch 동작
//   2. 상품 없음/shippingFee null → 스킵
//   3. 변동 미미 (임계값 미만)
//   4. 원가 상승 + marginRisk → 판매가 재계산
//   5. wholesalePriceWatch 저장
//   6. 원가 상승 + 마진 안전 → DB 도매가만 업데이트
//   7. 원가 하락 → 판매가 재계산
//   8. naverProductId 무효 (NaN) → 가격 업데이트 건너뜀
//   9. updateProductPrice 실패 → throw
//   10. 알림 — 상승 시 "⚠️ 마진율 위험"
//   11. 알림 — 하락 시 "정보"
//   12~14. enqueueWholesaleWatcherJobs
// =============================================

import type { Job, Queue } from 'bullmq'
import type { WholesaleWatcherJobData } from '../queues'

// =============================================
// BullMQ Mock — Worker 프로세서 캡처
// =============================================

let mockCapturedProcessor: ((job: Job<WholesaleWatcherJobData>) => Promise<unknown>) | null = null

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(
    (_queueName: string, processor: (job: Job<WholesaleWatcherJobData>) => Promise<unknown>) => {
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

const mockDetectWholesalePriceChange = jest.fn()
const mockCalculateWholesalePrice = jest.fn()

jest.mock('@smartstore/core', () => ({
  detectWholesalePriceChange: (...args: unknown[]) => mockDetectWholesalePriceChange(...args),
  calculateWholesalePrice: (...args: unknown[]) => mockCalculateWholesalePrice(...args),
}))

const mockUpdateProductPrice = jest.fn().mockResolvedValue(true)

jest.mock('@smartstore/integrations', () => ({
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
const mockProductUpdate = jest.fn().mockResolvedValue({})
const mockWholesalePriceWatchCreate = jest.fn().mockResolvedValue({ id: 'watch-1' })
const mockTransaction = jest.fn().mockResolvedValue([])

jest.mock('@smartstore/db', () => ({
  prisma: {
    product: {
      findUnique: (...args: unknown[]) => mockProductFindUnique(...args),
      findMany: (...args: unknown[]) => mockProductFindMany(...args),
      update: (...args: unknown[]) => mockProductUpdate(...args),
    },
    wholesalePriceWatch: {
      create: (...args: unknown[]) => mockWholesalePriceWatchCreate(...args),
    },
    priceHistory: {
      create: jest.fn().mockResolvedValue({}),
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
  QUEUE_NAMES: { WHOLESALE_WATCHER: 'wholesale-watcher' },
}))

jest.mock('../settings-cache', () => ({
  getSetting: jest.fn().mockReturnValue('true'),
}))

// =============================================
// 테스트
// =============================================

import { createWholesaleWatcherWorker, enqueueWholesaleWatcherJobs } from './wholesale-watcher.job'
import { getSetting } from '../settings-cache'
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

function makeWholesaleJob(overrides: Partial<WholesaleWatcherJobData> = {}): Job<WholesaleWatcherJobData> {
  return {
    id: 'job-ww-1',
    data: {
      productId: 'prod-1',
      currentWholesalePrice: 10000,
      crawledWholesalePrice: 12000,
      accountId: 'default',
      ...overrides,
    },
  } as Job<WholesaleWatcherJobData>
}

describe('createWholesaleWatcherWorker — 도매 원가 변동 감지', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCapturedProcessor = null
    ;(getSetting as jest.Mock).mockReturnValue('true')
    mockProductFindUnique.mockResolvedValue(DEFAULT_PRODUCT)
  })

  // ---- Kill Switch ----

  it('AUTO_PRICE_ENABLED=false → 스킵', async () => {
    ;(getSetting as jest.Mock).mockReturnValue('false')

    createWholesaleWatcherWorker()
    const result = await mockCapturedProcessor!(makeWholesaleJob())

    expect(result).toEqual({ skipped: true, reason: 'kill-switch' })
    expect(mockProductFindUnique).not.toHaveBeenCalled()
  })

  // ---- 상품 없음 ----

  it('상품 없음 → product_not_found 스킵', async () => {
    mockProductFindUnique.mockResolvedValue(null)

    createWholesaleWatcherWorker()
    const result = await mockCapturedProcessor!(makeWholesaleJob())

    expect(result).toEqual({ skipped: true, reason: 'product_not_found' })
  })

  it('shippingFee null → product_not_found 스킵', async () => {
    mockProductFindUnique.mockResolvedValue({ ...DEFAULT_PRODUCT, shippingFee: null })

    createWholesaleWatcherWorker()
    const result = await mockCapturedProcessor!(makeWholesaleJob())

    expect(result).toEqual({ skipped: true, reason: 'product_not_found' })
  })

  // ---- 변동 미미 (임계값 미만) ----

  it('변동 미미 → no_change', async () => {
    mockDetectWholesalePriceChange.mockReturnValue({
      changed: false,
      changeRate: 0.02,
      oldPrice: 10000,
      newPrice: 10200,
      marginRisk: false,
      estimatedNewMarginRate: 0.28,
    })

    createWholesaleWatcherWorker()
    const result = await mockCapturedProcessor!(makeWholesaleJob())

    expect(result).toEqual({ action: 'no_change', changeRate: 0.02 })
    expect(mockWholesalePriceWatchCreate).not.toHaveBeenCalled()
  })

  // ---- 원가 상승 + marginRisk → 판매가 재계산 ----

  it('원가 상승 + marginRisk → 판매가 재계산 + 네이버 업데이트', async () => {
    mockDetectWholesalePriceChange.mockReturnValue({
      changed: true,
      changeRate: 0.2,
      oldPrice: 10000,
      newPrice: 12000,
      marginRisk: true,
      estimatedNewMarginRate: 0.12,
    })
    mockCalculateWholesalePrice.mockReturnValue({ salePrice: 22500 })

    createWholesaleWatcherWorker()
    const result = await mockCapturedProcessor!(makeWholesaleJob())

    expect(result).toEqual({ action: 'detected', changeRate: 0.2, marginRisk: true })
    expect(mockUpdateProductPrice).toHaveBeenCalledWith(12345, 22500)
    expect(mockTransaction).toHaveBeenCalledTimes(1)
  })

  // ---- wholesalePriceWatch 저장 ----

  it('원가 상승 + marginRisk → wholesalePriceWatch 저장 (marginRisk=true)', async () => {
    mockDetectWholesalePriceChange.mockReturnValue({
      changed: true,
      changeRate: 0.2,
      oldPrice: 10000,
      newPrice: 12000,
      marginRisk: true,
      estimatedNewMarginRate: 0.12,
    })
    mockCalculateWholesalePrice.mockReturnValue({ salePrice: 22500 })

    createWholesaleWatcherWorker()
    await mockCapturedProcessor!(makeWholesaleJob())

    expect(mockWholesalePriceWatchCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: 'prod-1',
        oldPrice: 10000,
        newPrice: 12000,
        marginRisk: true,
      }),
    })
  })

  // ---- 원가 상승 + 마진 안전 → DB 도매가만 업데이트 ----

  it('원가 상승 + 마진 안전 → DB 도매가만 업데이트', async () => {
    mockDetectWholesalePriceChange.mockReturnValue({
      changed: true,
      changeRate: 0.1,
      oldPrice: 10000,
      newPrice: 11000,
      marginRisk: false,
      estimatedNewMarginRate: 0.22,
    })

    createWholesaleWatcherWorker()
    await mockCapturedProcessor!(makeWholesaleJob({ crawledWholesalePrice: 11000 }))

    // DB 도매가만 업데이트
    expect(mockProductUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { wholesalePrice: 11000 },
      }),
    )
    // 네이버 가격 업데이트 안 함
    expect(mockUpdateProductPrice).not.toHaveBeenCalled()
    // $transaction 안 함
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  // ---- 원가 하락 → 판매가 재계산 ----

  it('원가 하락 → 판매가 재계산 + 네이버 업데이트', async () => {
    mockDetectWholesalePriceChange.mockReturnValue({
      changed: true,
      changeRate: -0.15,
      oldPrice: 10000,
      newPrice: 8500,
      marginRisk: false,
      estimatedNewMarginRate: 0.35,
    })
    mockCalculateWholesalePrice.mockReturnValue({ salePrice: 17000 })

    createWholesaleWatcherWorker()
    const result = await mockCapturedProcessor!(makeWholesaleJob({ crawledWholesalePrice: 8500 }))

    expect(result).toEqual({ action: 'detected', changeRate: -0.15, marginRisk: false })
    expect(mockUpdateProductPrice).toHaveBeenCalledWith(12345, 17000)
    expect(mockTransaction).toHaveBeenCalledTimes(1)
  })

  // ---- naverProductId 무효 → 가격 업데이트 건너뜀 ----

  it('naverProductId NaN → 가격 업데이트 건너뜀', async () => {
    mockProductFindUnique.mockResolvedValue({
      ...DEFAULT_PRODUCT,
      naverProductId: 'invalid-abc',
    })
    mockDetectWholesalePriceChange.mockReturnValue({
      changed: true,
      changeRate: 0.2,
      oldPrice: 10000,
      newPrice: 12000,
      marginRisk: true,
      estimatedNewMarginRate: 0.12,
    })
    mockCalculateWholesalePrice.mockReturnValue({ salePrice: 22500 })

    createWholesaleWatcherWorker()
    const result = await mockCapturedProcessor!(makeWholesaleJob())

    expect(result).toEqual({ action: 'detected', changeRate: 0.2, marginRisk: true })
    expect(mockUpdateProductPrice).not.toHaveBeenCalled()
  })

  // ---- updateProductPrice 실패 → throw ----

  it('updateProductPrice 실패 → 에러 전파', async () => {
    mockDetectWholesalePriceChange.mockReturnValue({
      changed: true,
      changeRate: 0.2,
      oldPrice: 10000,
      newPrice: 12000,
      marginRisk: true,
      estimatedNewMarginRate: 0.12,
    })
    mockCalculateWholesalePrice.mockReturnValue({ salePrice: 22500 })
    mockUpdateProductPrice.mockRejectedValue(new Error('네이버 API 오류'))

    createWholesaleWatcherWorker()
    await expect(mockCapturedProcessor!(makeWholesaleJob())).rejects.toThrow('네이버 API 오류')
  })

  // ---- 알림 — 상승 시 "⚠️ 마진율 위험" ----

  it('원가 상승 알림 — "⚠️ 마진율 위험" 포함', async () => {
    mockDetectWholesalePriceChange.mockReturnValue({
      changed: true,
      changeRate: 0.2,
      oldPrice: 10000,
      newPrice: 12000,
      marginRisk: true,
      estimatedNewMarginRate: 0.12,
    })
    mockCalculateWholesalePrice.mockReturnValue({ salePrice: 22500 })
    mockUpdateProductPrice.mockResolvedValue(true)

    createWholesaleWatcherWorker()
    await mockCapturedProcessor!(makeWholesaleJob())

    expect(mockNotificationSend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'wholesale_price_changed',
        title: expect.stringContaining('마진율 위험'),
        message: expect.stringContaining('마진율'),
      }),
    )
  })

  // ---- 알림 — 하락 시 "정보" ----

  it('원가 하락 알림 — "정보" 포함', async () => {
    mockDetectWholesalePriceChange.mockReturnValue({
      changed: true,
      changeRate: -0.15,
      oldPrice: 10000,
      newPrice: 8500,
      marginRisk: false,
      estimatedNewMarginRate: 0.35,
    })
    mockCalculateWholesalePrice.mockReturnValue({ salePrice: 17000 })
    mockUpdateProductPrice.mockResolvedValue(true)

    createWholesaleWatcherWorker()
    await mockCapturedProcessor!(makeWholesaleJob({ crawledWholesalePrice: 8500 }))

    expect(mockNotificationSend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'wholesale_price_changed',
        title: expect.stringContaining('정보'),
      }),
    )
  })
})

// =============================================
// enqueueWholesaleWatcherJobs
// =============================================

describe('enqueueWholesaleWatcherJobs', () => {
  const mockAddBulk = jest.fn().mockResolvedValue([])
  const mockQueue = { addBulk: mockAddBulk } as unknown as Queue

  beforeEach(() => {
    jest.clearAllMocks()
    process.env['ACCOUNT_ID'] = 'default'
  })

  it('빈 Map → return 0', async () => {
    const crawledPrices = new Map<string, number>()

    const count = await enqueueWholesaleWatcherJobs(mockQueue, crawledPrices)

    expect(count).toBe(0)
    expect(mockAddBulk).not.toHaveBeenCalled()
  })

  it('상품 3개 크롤링, 1개 매칭 → addBulk 1개', async () => {
    mockProductFindMany.mockResolvedValue([
      { id: 'p1', wholesalePrice: 10000 },
    ])
    const crawledPrices = new Map([
      ['p1', 12000],
      ['p2', 8000],
      ['p3', 9000],
    ])

    const count = await enqueueWholesaleWatcherJobs(mockQueue, crawledPrices)

    expect(count).toBe(1)
    expect(mockAddBulk).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'watch-wholesale',
          data: expect.objectContaining({
            productId: 'p1',
            currentWholesalePrice: 10000,
            crawledWholesalePrice: 12000,
          }),
        }),
      ]),
    )
  })

  it('활성 상품 없음 → return 0', async () => {
    mockProductFindMany.mockResolvedValue([])
    const crawledPrices = new Map([['p1', 12000]])

    const count = await enqueueWholesaleWatcherJobs(mockQueue, crawledPrices)

    expect(count).toBe(0)
    expect(mockAddBulk).not.toHaveBeenCalled()
  })
})

// =============================================
// console.log 부재 검증
// =============================================

describe('wholesale-watcher.job.ts — console.log 부재', () => {
  it('소스 파일에 console.log가 없음', () => {
    const filePath = path.resolve(__dirname, './wholesale-watcher.job.ts')
    const source = fs.readFileSync(filePath, 'utf8')
    const consoleUsages = source.match(/console\.(log|warn|error|info)\(/g)
    expect(consoleUsages).toBeNull()
  })
})
