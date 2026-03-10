// =============================================
// 배송 알림 워커 테스트
//
// 검증 항목:
//   1. Kill Switch 동작
//   2. Credential gate 실패
//   3. 정상 발송 → DB→shipped + 알림
//   4. confirmShipping 실패 → throw
//   5. getTrackingUrl — CJ대한통운
//   6. getTrackingUrl — 미지원 택배사
//   7. getOrdersReadyForShipping 쿼리
// =============================================

import type { Job } from 'bullmq'
import type { ShippingNotificationJobData } from '../queues'

// =============================================
// BullMQ Mock
// =============================================

let mockCapturedProcessor: ((job: Job<ShippingNotificationJobData>) => Promise<unknown>) | null = null

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(
    (_queueName: string, processor: (job: Job<ShippingNotificationJobData>) => Promise<unknown>) => {
      mockCapturedProcessor = processor
      return { on: jest.fn() }
    },
  ),
}))

// =============================================
// 의존성 Mock
// =============================================

const mockConfirmShipping = jest.fn().mockResolvedValue(true)

jest.mock('@smartstore/integrations', () => ({
  confirmShipping: (...args: unknown[]) => mockConfirmShipping(...args),
}))

const mockOrderUpdate = jest.fn().mockResolvedValue({})
const mockOrderFindMany = jest.fn().mockResolvedValue([])
const mockJobLogCreate = jest.fn().mockResolvedValue({ id: 'log-1' })
const mockJobLogUpdate = jest.fn().mockResolvedValue({})

jest.mock('@smartstore/db', () => ({
  prisma: {
    order: {
      update: (...args: unknown[]) => mockOrderUpdate(...args),
      findMany: (...args: unknown[]) => mockOrderFindMany(...args),
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
  QUEUE_NAMES: { SHIPPING_NOTIFICATION: 'shipping-notification' },
}))

const mockGateSkipResult = jest.fn().mockReturnValue({ skipped: true, reason: 'credential-gate' })

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

import { createShippingWorker, getOrdersReadyForShipping } from './shipping.job'
import { getSetting } from '../settings-cache'
import { checkCredentialGate } from '../credential-gate'
import * as fs from 'fs'
import * as path from 'path'

function makeShippingJob(overrides: Partial<ShippingNotificationJobData> = {}): Job<ShippingNotificationJobData> {
  return {
    id: 'job-ship-1',
    data: {
      orderId: 'order-1',
      productOrderId: 'po-1',
      trackingNumber: '1234567890',
      courier: 'CJ대한통운',
      customerName: '홍길동',
      productName: '테스트 상품',
      ...overrides,
    },
  } as Job<ShippingNotificationJobData>
}

describe('createShippingWorker — 배송 알림', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCapturedProcessor = null
    ;(getSetting as jest.Mock).mockReturnValue('true')
    ;(checkCredentialGate as jest.Mock).mockResolvedValue({ passed: true, missing: [] })
  })

  // ---- Kill Switch ----

  it('AUTO_SHIPPING_ENABLED=false → 스킵', async () => {
    ;(getSetting as jest.Mock).mockReturnValue('false')

    createShippingWorker()
    const result = await mockCapturedProcessor!(makeShippingJob())

    expect(result).toEqual({ skipped: true, reason: 'kill-switch' })
    expect(mockConfirmShipping).not.toHaveBeenCalled()
  })

  // ---- Credential Gate ----

  it('Credential gate 실패 → gateSkipResult 반환', async () => {
    ;(checkCredentialGate as jest.Mock).mockResolvedValue({ passed: false, missing: ['naver_commerce'] })

    createShippingWorker()
    const result = await mockCapturedProcessor!(makeShippingJob())

    expect(result).toEqual({ skipped: true, reason: 'credential-gate' })
    expect(mockConfirmShipping).not.toHaveBeenCalled()
  })

  // ---- 정상 발송 ----

  it('정상: 발송 확인 성공 → DB→shipped + 알림', async () => {
    createShippingWorker()
    const result = await mockCapturedProcessor!(makeShippingJob())

    expect(result).toEqual({ success: true, trackingNumber: '1234567890' })

    // confirmShipping 호출
    expect(mockConfirmShipping).toHaveBeenCalledWith('po-1', 'CJ대한통운', '1234567890')

    // DB 주문 상태 업데이트
    expect(mockOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'shipped', trackingNumber: '1234567890' }),
      }),
    )

    // 알림 전송 (CJ대한통운 URL 포함)
    expect(mockNotificationSend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'order_shipped',
        message: expect.stringContaining('cjlogistics.com'),
      }),
    )

    // jobLog 완료
    expect(mockJobLogUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'completed' }),
      }),
    )
  })

  // ---- confirmShipping 실패 ----

  it('confirmShipping 실패 → throw + jobLog failed', async () => {
    mockConfirmShipping.mockResolvedValueOnce(false)

    createShippingWorker()
    await expect(mockCapturedProcessor!(makeShippingJob())).rejects.toThrow('네이버 발송 처리 실패')

    expect(mockJobLogUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed' }),
      }),
    )
  })

  // ---- 미지원 택배사 → 알림에 URL 없음 (크래시 없음) ----

  it('미지원 택배사 → 알림 전송되지만 배송 조회 URL 없음', async () => {
    createShippingWorker()
    await mockCapturedProcessor!(makeShippingJob({ courier: '알 수 없는 택배' }))

    expect(mockNotificationSend).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.not.stringContaining('배송 조회'),
      }),
    )
  })
})

// ---- getOrdersReadyForShipping ----

describe('getOrdersReadyForShipping', () => {
  it('Prisma findMany 호출 확인', async () => {
    await getOrdersReadyForShipping()

    expect(mockOrderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'preparing',
          shippedAt: null,
        }),
      }),
    )
  })
})

describe('shipping.job.ts — console.log 부재', () => {
  it('소스 파일에 console.log가 없음', () => {
    const filePath = path.resolve(__dirname, './shipping.job.ts')
    const source = fs.readFileSync(filePath, 'utf8')
    const consoleUsages = source.match(/console\.(log|warn|error|info)\(/g)
    expect(consoleUsages).toBeNull()
  })
})
