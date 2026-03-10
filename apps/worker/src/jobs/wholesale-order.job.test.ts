// =============================================
// 도매처 자동 주문 워커 테스트
//
// 검증 항목:
//   1. autoWholesaleOrderEnabled=false이면 skip
//   2. source='domaegguk'일 때 DomaeggukOrderer 사용
//   3. source='ownerclan'일 때 OwnerclanOrderer 사용
//   4. 정상 발주 -> wholesaleOrderStatus='ordered' 업데이트
//   5. 정상 발주 -> WholesaleOrderLog 생성
//   6. 정상 발주 -> tracking-poll 큐에 30분 후 폴링 추가
//   7. 발주 실패 -> wholesaleOrderStatus='failed' 업데이트
//   8. 발주 실패 -> 텔레그램 알림 발송
//   9. 발주 실패 -> WholesaleOrderLog에 에러 기록
//   10. 이미 wholesaleOrderStatus='ordered'인 주문 -> 중복 방지 skip
//   11. credentials 미설정 시 에러 throw
//   12. 워커 concurrency=1 확인
// =============================================

import type { Job } from 'bullmq'
import type { WholesaleOrderJobData } from '../queues'

// =============================================
// BullMQ Mock -- Worker 프로세서 캡처
// =============================================

let mockCapturedProcessor: ((job: Job<WholesaleOrderJobData>) => Promise<unknown>) | null = null
let mockCapturedWorkerOptions: Record<string, unknown> | null = null

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(
    (
      _queueName: string,
      processor: (job: Job<WholesaleOrderJobData>) => Promise<unknown>,
      options?: Record<string, unknown>,
    ) => {
      mockCapturedProcessor = processor
      mockCapturedWorkerOptions = options ?? null
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

const mockLogin = jest.fn().mockResolvedValue(undefined)
const mockPlaceOrder = jest.fn()
const mockClose = jest.fn().mockResolvedValue(undefined)

jest.mock('@smartstore/crawlers', () => ({
  DomaeggukOrderer: jest.fn().mockImplementation(() => ({
    login: () => mockLogin(),
    placeOrder: (...args: unknown[]) => mockPlaceOrder(...args),
    close: () => mockClose(),
  })),
  OwnerclanOrderer: jest.fn().mockImplementation(() => ({
    login: () => mockLogin(),
    placeOrder: (...args: unknown[]) => mockPlaceOrder(...args),
    close: () => mockClose(),
  })),
}))

const mockOrderFindUnique = jest.fn()
const mockOrderUpdate = jest.fn().mockResolvedValue({})
const mockWholesaleOrderLogCreate = jest.fn().mockResolvedValue({ id: 'wlog-1' })

jest.mock('@smartstore/db', () => ({
  prisma: {
    order: {
      findUnique: (...args: unknown[]) => mockOrderFindUnique(...args),
      update: (...args: unknown[]) => mockOrderUpdate(...args),
    },
    wholesaleOrderLog: {
      create: (...args: unknown[]) => mockWholesaleOrderLogCreate(...args),
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
    autoWholesaleOrderEnabled: true,
    domeggook: { username: 'test-user', password: 'test-pass' },
    ownerclan: { username: 'oc-user', password: 'oc-pass' },
  },
}))

const mockNotificationSend = jest.fn().mockResolvedValue(undefined)

jest.mock('@smartstore/adapters', () => ({
  notificationAdapter: {
    send: (...args: unknown[]) => mockNotificationSend(...args),
  },
}))

const mockTrackingPollQueueAdd = jest.fn().mockResolvedValue(undefined)

jest.mock('../queues', () => ({
  QUEUE_NAMES: { WHOLESALE_ORDER: 'wholesale-order' },
  redisConnection: { host: 'localhost', port: 6379 },
  trackingPollQueue: {
    add: (...args: unknown[]) => mockTrackingPollQueueAdd(...args),
  },
}))

// =============================================
// 테스트
// =============================================

import { createWholesaleOrderWorker } from './wholesale-order.job'
import { DomaeggukOrderer } from '@smartstore/crawlers'
import { OwnerclanOrderer } from '@smartstore/crawlers'
import { config } from '@smartstore/shared'
import * as fs from 'fs'
import * as path from 'path'

/** 테스트용 Job 객체 생성 */
function makeJob(overrides: Partial<WholesaleOrderJobData> = {}): Job<WholesaleOrderJobData> {
  return {
    id: 'job-wo-1',
    data: {
      orderId: 'order-1',
      naverOrderId: 'naver-123',
      source: 'domaegguk' as const,
      sourceProductId: 'src-prod-1',
      quantity: 2,
      shippingAddress: {
        name: '홍길동',
        phone: '010-1234-5678',
        address: '서울시 강남구',
        zipCode: '06000',
      },
      ...overrides,
    },
  } as Job<WholesaleOrderJobData>
}

/** 기본 Order DB 데이터 */
const defaultOrder = {
  id: 'order-1',
  naverOrderId: 'naver-123',
  wholesaleOrderStatus: null,
  wholesaleOrderId: null,
}

describe('createWholesaleOrderWorker -- 도매처 자동 주문', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCapturedProcessor = null
    mockCapturedWorkerOptions = null
    mockOrderFindUnique.mockResolvedValue({ ...defaultOrder })
    mockPlaceOrder.mockResolvedValue({
      success: true,
      wholesaleOrderId: 'WO-12345',
    })
    // Reset config mock
    ;(config as Record<string, unknown>).autoWholesaleOrderEnabled = true
    ;(config as Record<string, Record<string, string>>).domeggook = {
      username: 'test-user',
      password: 'test-pass',
    }
    ;(config as Record<string, Record<string, string>>).ownerclan = {
      username: 'oc-user',
      password: 'oc-pass',
    }
  })

  // ---- 1. Kill Switch ----

  it('autoWholesaleOrderEnabled=false -> skip', async () => {
    ;(config as Record<string, unknown>).autoWholesaleOrderEnabled = false

    createWholesaleOrderWorker()
    const result = await mockCapturedProcessor!(makeJob())

    expect(result).toEqual({ skipped: true, reason: 'kill-switch' })
    expect(mockOrderFindUnique).not.toHaveBeenCalled()
    expect(mockPlaceOrder).not.toHaveBeenCalled()
  })

  // ---- 2. source='domaegguk' -> DomaeggukOrderer ----

  it('source=domaegguk -> DomaeggukOrderer 생성', async () => {
    createWholesaleOrderWorker()
    await mockCapturedProcessor!(makeJob({ source: 'domaegguk' }))

    expect(DomaeggukOrderer).toHaveBeenCalledWith('test-user', 'test-pass')
    expect(OwnerclanOrderer).not.toHaveBeenCalled()
  })

  // ---- 3. source='ownerclan' -> OwnerclanOrderer ----

  it('source=ownerclan -> OwnerclanOrderer 생성', async () => {
    createWholesaleOrderWorker()
    await mockCapturedProcessor!(makeJob({ source: 'ownerclan' }))

    expect(OwnerclanOrderer).toHaveBeenCalledWith('oc-user', 'oc-pass')
    expect(DomaeggukOrderer).not.toHaveBeenCalled()
  })

  // ---- 4. 정상 발주 -> wholesaleOrderStatus='ordered' ----

  it('정상 발주 -> Order.wholesaleOrderStatus=ordered 업데이트', async () => {
    createWholesaleOrderWorker()
    await mockCapturedProcessor!(makeJob())

    expect(mockOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-1' },
        data: expect.objectContaining({
          wholesaleOrderStatus: 'ordered',
          wholesaleOrderId: 'WO-12345',
        }),
      }),
    )
  })

  // ---- 5. 정상 발주 -> WholesaleOrderLog 생성 ----

  it('정상 발주 -> WholesaleOrderLog status=ordered 생성', async () => {
    createWholesaleOrderWorker()
    await mockCapturedProcessor!(makeJob())

    expect(mockWholesaleOrderLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'order-1',
          source: 'domaegguk',
          wholesaleOrderId: 'WO-12345',
          status: 'ordered',
        }),
      }),
    )
  })

  // ---- 6. 정상 발주 -> tracking-poll 큐에 30분 후 폴링 추가 ----

  it('정상 발주 -> trackingPollQueue.add 30분 delay', async () => {
    createWholesaleOrderWorker()
    await mockCapturedProcessor!(makeJob())

    expect(mockTrackingPollQueueAdd).toHaveBeenCalledWith(
      'poll-tracking',
      expect.objectContaining({
        orderId: 'order-1',
        wholesaleOrderId: 'WO-12345',
        source: 'domaegguk',
        naverProductOrderId: 'naver-123',
        pollAttempt: 0,
        maxAttempts: 48,
      }),
      expect.objectContaining({
        delay: 30 * 60 * 1000,
      }),
    )
  })

  // ---- 7. 발주 실패 -> wholesaleOrderStatus='failed' ----

  it('발주 실패 -> Order.wholesaleOrderStatus=failed 업데이트', async () => {
    mockPlaceOrder.mockResolvedValue({
      success: false,
      errorMessage: '품절된 상품입니다',
    })

    createWholesaleOrderWorker()
    await mockCapturedProcessor!(makeJob())

    expect(mockOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-1' },
        data: expect.objectContaining({
          wholesaleOrderStatus: 'failed',
        }),
      }),
    )
  })

  // ---- 8. 발주 실패 -> 텔레그램 알림 ----

  it('발주 실패 -> 알림 발송', async () => {
    mockPlaceOrder.mockResolvedValue({
      success: false,
      errorMessage: '로그인 실패',
    })

    createWholesaleOrderWorker()
    await mockCapturedProcessor!(makeJob())

    expect(mockNotificationSend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'wholesale_order_failed',
      }),
    )
  })

  // ---- 9. 발주 실패 -> WholesaleOrderLog에 에러 기록 ----

  it('발주 실패 -> WholesaleOrderLog status=failed + errorMessage', async () => {
    mockPlaceOrder.mockResolvedValue({
      success: false,
      errorMessage: '캡차 감지됨',
    })

    createWholesaleOrderWorker()
    await mockCapturedProcessor!(makeJob())

    expect(mockWholesaleOrderLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'order-1',
          source: 'domaegguk',
          status: 'failed',
          errorMessage: '캡차 감지됨',
        }),
      }),
    )
  })

  // ---- 10. 이미 ordered -> 중복 방지 skip ----

  it('wholesaleOrderStatus=ordered -> 중복 발주 방지 skip', async () => {
    mockOrderFindUnique.mockResolvedValue({
      ...defaultOrder,
      wholesaleOrderStatus: 'ordered',
    })

    createWholesaleOrderWorker()
    const result = await mockCapturedProcessor!(makeJob())

    expect(result).toEqual(
      expect.objectContaining({ skipped: true, reason: 'already-ordered' }),
    )
    expect(mockPlaceOrder).not.toHaveBeenCalled()
  })

  // ---- 11. credentials 미설정 -> 에러 throw ----

  it('credentials 미설정 -> 에러 throw', async () => {
    ;(config as Record<string, Record<string, string>>).domeggook = {
      username: '',
      password: '',
    }

    createWholesaleOrderWorker()
    await expect(mockCapturedProcessor!(makeJob())).rejects.toThrow()
    expect(mockPlaceOrder).not.toHaveBeenCalled()
  })

  // ---- 12. concurrency=1 ----

  it('워커 concurrency=1', () => {
    createWholesaleOrderWorker()

    expect(mockCapturedWorkerOptions).toEqual(
      expect.objectContaining({ concurrency: 1 }),
    )
  })

  // ---- close() 항상 호출 ----

  it('에러 발생 시에도 orderer.close() 호출', async () => {
    mockLogin.mockRejectedValueOnce(new Error('로그인 실패'))

    createWholesaleOrderWorker()
    // login 실패 -> throw, but close should still be called
    await expect(mockCapturedProcessor!(makeJob())).rejects.toThrow('로그인 실패')

    expect(mockClose).toHaveBeenCalled()
  })
})

// =============================================
// console.log 부재 검증
// =============================================

describe('wholesale-order.job.ts -- console.log 부재', () => {
  it('소스 파일에 console.log가 없음', () => {
    const filePath = path.resolve(__dirname, './wholesale-order.job.ts')
    const source = fs.readFileSync(filePath, 'utf8')
    const consoleUsages = source.match(/console\.(log|warn|error|info)\(/g)
    expect(consoleUsages).toBeNull()
  })
})
