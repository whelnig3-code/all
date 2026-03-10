// =============================================
// 운송장 폴링 워커 테스트
//
// 검증 항목:
//   1. 운송장 발견 -> DB trackingNumber/courier 업데이트
//   2. 운송장 발견 -> wholesaleOrderStatus='shipped' 업데이트
//   3. 운송장 발견 -> shipping-notification 큐에 발송 작업 추가
//   4. 운송장 미발견 + pollAttempt < maxAttempts -> 30분 후 재스케줄
//   5. 운송장 미발견 + pollAttempt < maxAttempts -> pollAttempt 증가
//   6. 운송장 미발견 + pollAttempt >= maxAttempts -> 텔레그램 알림
//   7. 운송장 미발견 + maxAttempts 초과 -> 재스케줄 안 함
//   8. DB lastTrackingPollAt / trackingPollCount 업데이트
//   9. source에 따라 올바른 Orderer 사용
//   10. Orderer.close() 항상 호출 (finally)
// =============================================

import type { Job } from 'bullmq'
import type { TrackingPollJobData } from '../queues'

// =============================================
// BullMQ Mock
// =============================================

let mockCapturedProcessor: ((job: Job<TrackingPollJobData>) => Promise<unknown>) | null = null

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(
    (_queueName: string, processor: (job: Job<TrackingPollJobData>) => Promise<unknown>) => {
      mockCapturedProcessor = processor
      return { on: jest.fn() }
    },
  ),
}))

// =============================================
// 의존성 Mock
// =============================================

const mockGetTrackingNumber = jest.fn()
const mockLogin = jest.fn().mockResolvedValue(undefined)
const mockClose = jest.fn().mockResolvedValue(undefined)

const mockOrdererInstance = {
  login: mockLogin,
  getTrackingNumber: mockGetTrackingNumber,
  close: mockClose,
}

jest.mock('@smartstore/crawlers', () => ({
  DomaeggukOrderer: jest.fn().mockImplementation(() => mockOrdererInstance),
  OwnerclanOrderer: jest.fn().mockImplementation(() => mockOrdererInstance),
}))

const mockOrderUpdate = jest.fn().mockResolvedValue({})
const mockOrderFindUnique = jest.fn().mockResolvedValue({
  id: 'order-1',
  customerName: '홍길동',
  naverOrderId: 'naver-order-1',
  product: { name: '테스트 상품' },
})

jest.mock('@smartstore/db', () => ({
  prisma: {
    order: {
      update: (...args: unknown[]) => mockOrderUpdate(...args),
      findUnique: (...args: unknown[]) => mockOrderFindUnique(...args),
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
    domeggook: { username: 'test-user', password: 'test-pass' },
    ownerclan: { username: 'test-user', password: 'test-pass' },
  },
}))

const mockNotificationSend = jest.fn().mockResolvedValue(undefined)

jest.mock('@smartstore/adapters', () => ({
  notificationAdapter: {
    send: (...args: unknown[]) => mockNotificationSend(...args),
  },
}))

const mockTrackingPollQueueAdd = jest.fn().mockResolvedValue(undefined)
const mockShippingNotificationQueueAdd = jest.fn().mockResolvedValue(undefined)

jest.mock('../queues', () => ({
  QUEUE_NAMES: { TRACKING_POLL: 'tracking-poll' },
  redisConnection: { host: 'localhost', port: 6379 },
  trackingPollQueue: {
    add: (...args: unknown[]) => mockTrackingPollQueueAdd(...args),
  },
  shippingNotificationQueue: {
    add: (...args: unknown[]) => mockShippingNotificationQueueAdd(...args),
  },
}))

// =============================================
// 테스트
// =============================================

import { createTrackingPollWorker } from './tracking-poll.job'
import { DomaeggukOrderer, OwnerclanOrderer } from '@smartstore/crawlers'
import * as fs from 'fs'
import * as path from 'path'

const POLL_INTERVAL_MS = 30 * 60 * 1000

function makeTrackingPollJob(overrides: Partial<TrackingPollJobData> = {}): Job<TrackingPollJobData> {
  return {
    id: 'job-tracking-1',
    data: {
      orderId: 'order-1',
      wholesaleOrderId: 'wholesale-123',
      source: 'domaegguk',
      naverProductOrderId: 'naver-po-1',
      pollAttempt: 1,
      maxAttempts: 48,
      ...overrides,
    },
  } as Job<TrackingPollJobData>
}

describe('createTrackingPollWorker -- 운송장 폴링', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCapturedProcessor = null
    mockGetTrackingNumber.mockResolvedValue(null)
    mockOrderFindUnique.mockResolvedValue({
      id: 'order-1',
      customerName: '홍길동',
      naverOrderId: 'naver-order-1',
      product: { name: '테스트 상품' },
    })
  })

  // ---- 1. 운송장 발견 -> DB trackingNumber/courier 업데이트 ----

  it('운송장 발견 시 DB에 trackingNumber와 courier 업데이트', async () => {
    mockGetTrackingNumber.mockResolvedValueOnce('9876543210')

    createTrackingPollWorker()
    await mockCapturedProcessor!(makeTrackingPollJob())

    expect(mockOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-1' },
        data: expect.objectContaining({
          trackingNumber: '9876543210',
        }),
      }),
    )
  })

  // ---- 2. 운송장 발견 -> wholesaleOrderStatus='shipped' ----

  it('운송장 발견 시 wholesaleOrderStatus를 shipped로 업데이트', async () => {
    mockGetTrackingNumber.mockResolvedValueOnce('9876543210')

    createTrackingPollWorker()
    await mockCapturedProcessor!(makeTrackingPollJob())

    expect(mockOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          wholesaleOrderStatus: 'shipped',
        }),
      }),
    )
  })

  // ---- 3. 운송장 발견 -> shipping-notification 큐에 발송 작업 추가 ----

  it('운송장 발견 시 shipping-notification 큐에 작업 추가', async () => {
    mockGetTrackingNumber.mockResolvedValueOnce('9876543210')

    createTrackingPollWorker()
    await mockCapturedProcessor!(makeTrackingPollJob())

    expect(mockShippingNotificationQueueAdd).toHaveBeenCalledWith(
      'ship-notification',
      expect.objectContaining({
        orderId: 'order-1',
        productOrderId: 'naver-po-1',
        trackingNumber: '9876543210',
      }),
    )
  })

  // ---- 4. 운송장 미발견 + pollAttempt < maxAttempts -> 30분 후 재스케줄 ----

  it('운송장 미발견 + 시도 횟수 미초과 시 30분 후 재스케줄', async () => {
    mockGetTrackingNumber.mockResolvedValueOnce(null)

    createTrackingPollWorker()
    await mockCapturedProcessor!(makeTrackingPollJob({ pollAttempt: 3, maxAttempts: 48 }))

    expect(mockTrackingPollQueueAdd).toHaveBeenCalledWith(
      'poll-tracking',
      expect.anything(),
      expect.objectContaining({ delay: POLL_INTERVAL_MS }),
    )
  })

  // ---- 5. 운송장 미발견 + pollAttempt 증가 ----

  it('재스케줄 시 pollAttempt가 1 증가', async () => {
    mockGetTrackingNumber.mockResolvedValueOnce(null)

    createTrackingPollWorker()
    await mockCapturedProcessor!(makeTrackingPollJob({ pollAttempt: 5, maxAttempts: 48 }))

    expect(mockTrackingPollQueueAdd).toHaveBeenCalledWith(
      'poll-tracking',
      expect.objectContaining({ pollAttempt: 6 }),
      expect.anything(),
    )
  })

  // ---- 6. 운송장 미발견 + pollAttempt >= maxAttempts -> 텔레그램 알림 ----

  it('최대 시도 초과 시 텔레그램 알림 발송', async () => {
    mockGetTrackingNumber.mockResolvedValueOnce(null)

    createTrackingPollWorker()
    await mockCapturedProcessor!(makeTrackingPollJob({ pollAttempt: 48, maxAttempts: 48 }))

    expect(mockNotificationSend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'system_alert',
        title: expect.stringContaining('운송장'),
      }),
    )
  })

  // ---- 7. 운송장 미발견 + maxAttempts 초과 -> 재스케줄 안 함 ----

  it('최대 시도 초과 시 재스케줄하지 않음', async () => {
    mockGetTrackingNumber.mockResolvedValueOnce(null)

    createTrackingPollWorker()
    await mockCapturedProcessor!(makeTrackingPollJob({ pollAttempt: 48, maxAttempts: 48 }))

    expect(mockTrackingPollQueueAdd).not.toHaveBeenCalled()
  })

  // ---- 8. DB lastTrackingPollAt / trackingPollCount 업데이트 ----

  it('폴링 시 lastTrackingPollAt과 trackingPollCount 업데이트', async () => {
    mockGetTrackingNumber.mockResolvedValueOnce(null)

    createTrackingPollWorker()
    await mockCapturedProcessor!(makeTrackingPollJob({ pollAttempt: 2, maxAttempts: 48 }))

    // 재스케줄 케이스에서도 DB 업데이트가 호출됨
    expect(mockOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-1' },
        data: expect.objectContaining({
          lastTrackingPollAt: expect.any(Date),
          trackingPollCount: expect.objectContaining({ increment: 1 }),
        }),
      }),
    )
  })

  // ---- 9. source에 따라 올바른 Orderer 사용 ----

  it('source가 domaegguk이면 DomaeggukOrderer 사용', async () => {
    mockGetTrackingNumber.mockResolvedValueOnce(null)

    createTrackingPollWorker()
    await mockCapturedProcessor!(makeTrackingPollJob({ source: 'domaegguk' }))

    expect(DomaeggukOrderer).toHaveBeenCalled()
    expect(OwnerclanOrderer).not.toHaveBeenCalled()
  })

  it('source가 ownerclan이면 OwnerclanOrderer 사용', async () => {
    mockGetTrackingNumber.mockResolvedValueOnce(null)

    createTrackingPollWorker()
    await mockCapturedProcessor!(makeTrackingPollJob({ source: 'ownerclan' }))

    expect(OwnerclanOrderer).toHaveBeenCalled()
    expect(DomaeggukOrderer).not.toHaveBeenCalled()
  })

  // ---- 10. Orderer.close() 항상 호출 (finally) ----

  it('정상 처리 후 orderer.close() 호출', async () => {
    mockGetTrackingNumber.mockResolvedValueOnce('1234567890')

    createTrackingPollWorker()
    await mockCapturedProcessor!(makeTrackingPollJob())

    expect(mockClose).toHaveBeenCalled()
  })

  it('에러 발생 시에도 orderer.close() 호출', async () => {
    mockLogin.mockRejectedValueOnce(new Error('로그인 실패'))

    createTrackingPollWorker()

    await expect(mockCapturedProcessor!(makeTrackingPollJob())).rejects.toThrow('로그인 실패')

    expect(mockClose).toHaveBeenCalled()
  })

  it('getTrackingNumber 에러 시에도 orderer.close() 호출', async () => {
    mockGetTrackingNumber.mockRejectedValueOnce(new Error('네트워크 에러'))

    createTrackingPollWorker()

    await expect(mockCapturedProcessor!(makeTrackingPollJob())).rejects.toThrow('네트워크 에러')

    expect(mockClose).toHaveBeenCalled()
  })
})

describe('tracking-poll.job.ts -- console.log 부재', () => {
  it('소스 파일에 console.log가 없음', () => {
    const filePath = path.resolve(__dirname, './tracking-poll.job.ts')
    const source = fs.readFileSync(filePath, 'utf8')
    const consoleUsages = source.match(/console\.(log|warn|error|info)\(/g)
    expect(consoleUsages).toBeNull()
  })
})
