// =============================================
// 주문 워커 보안 검증 테스트
//
// 검증 항목:
//   1. 전화번호가 encryptPhone()으로 암호화되어 DB에 저장되는지
//   2. 전화번호 없는 경우 빈 문자열 페이로드 저장
//   3. console.log가 없는지 (민감 데이터 노출 방지)
//   4. Kill Switch 동작 확인
//   5. 중복 주문 스킵 확인
// =============================================

import type { Job, Queue } from 'bullmq'
import type { OrderJobData } from '../queues'

// =============================================
// BullMQ Mock — Worker 프로세서 캡처
// =============================================

let mockCapturedProcessor: ((job: Job<OrderJobData>) => Promise<unknown>) | null = null

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(
    (_queueName: string, processor: (job: Job<OrderJobData>) => Promise<unknown>) => {
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

const mockEncryptPhone = jest.fn().mockReturnValue({
  ciphertext: 'enc_cipher_base64',
  iv: 'enc_iv_base64',
  authTag: 'enc_tag_base64',
})

jest.mock('@smartstore/core', () => ({
  encryptPhone: (...args: unknown[]) => mockEncryptPhone(...args),
  createApprovalRequest: jest.fn().mockResolvedValue({ ok: true }),
}))

const mockOrderCreate = jest.fn().mockResolvedValue({ id: 'order-1' })
const mockOrderFindUnique = jest.fn().mockResolvedValue(null)
const mockJobLogCreate = jest.fn().mockResolvedValue({ id: 'log-1' })
const mockJobLogUpdate = jest.fn().mockResolvedValue({})

jest.mock('@smartstore/db', () => ({
  prisma: {
    order: {
      findUnique: (...args: unknown[]) => mockOrderFindUnique(...args),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: (...args: unknown[]) => mockOrderCreate(...args),
    },
    product: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'prod-1',
        name: '테스트 상품',
        naverProductId: 'naver-123',
        salePrice: 15000,
        wholesalePrice: 10000,
        shippingFee: 2500,
        naverFeeRate: 0.05,
        source: 'domaegguk',
        sourceProductId: 'dmg-001',
      }),
      findUnique: jest.fn().mockResolvedValue({
        id: 'prod-1',
        source: 'domaegguk',
        sourceProductId: 'dmg-001',
      }),
    },
    jobLog: {
      create: (...args: unknown[]) => mockJobLogCreate(...args),
      update: (...args: unknown[]) => mockJobLogUpdate(...args),
    },
  },
}))

const mockConfig = {
  redis: { host: 'localhost', port: 6379, password: undefined },
  autoWholesaleOrderEnabled: true,
}

jest.mock('@smartstore/shared', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
  config: mockConfig,
}))

jest.mock('@smartstore/integrations', () => ({
  fetchNewOrders: jest.fn().mockResolvedValue([]),
  mapNaverOrderToInternal: jest.fn().mockReturnValue({
    quantity: 1,
    salePrice: 15000,
    customerName: '홍길동',
    customerPhone: '010-1234-5678',
    customerAddress: '서울시 강남구',
    status: 'paid',
    orderedAt: new Date('2026-03-01'),
    paidAt: new Date('2026-03-01'),
  }),
}))

jest.mock('@smartstore/adapters', () => ({
  notificationAdapter: {
    send: jest.fn().mockResolvedValue(undefined),
  },
}))

const mockWholesaleOrderQueueAdd = jest.fn().mockResolvedValue(undefined)

jest.mock('../queues', () => ({
  QUEUE_NAMES: { ORDER_PROCESSING: 'order-processing' },
  shippingNotificationQueue: { add: jest.fn() },
  orderApprovalQueue: { add: jest.fn() },
  wholesaleOrderQueue: { add: (...args: unknown[]) => mockWholesaleOrderQueueAdd(...args) },
}))

// 자격증명 게이트 — 항상 통과
jest.mock('../credential-gate', () => ({
  checkCredentialGate: jest.fn().mockResolvedValue({ passed: true, missing: [] }),
  gateSkipResult: jest.fn(),
}))

// Kill Switch 기본: 활성
jest.mock('../settings-cache', () => ({
  getSetting: jest.fn().mockReturnValue('true'),
}))

// =============================================
// 테스트
// =============================================

import { createOrderWorker, pollAndEnqueueNewOrders } from './order.job'
import { getSetting } from '../settings-cache'
import * as fs from 'fs'
import * as path from 'path'

/** 테스트용 Job 객체 생성 */
function makeOrderJob(
  naverOrderId: string,
  overrides: Partial<OrderJobData> = {},
): Job<OrderJobData> {
  return {
    id: `job-${naverOrderId}`,
    data: {
      naverOrderId,
      trigger: 'poll' as const,
      orderItem: {
        productOrderId: naverOrderId,
        productId: 'naver-123',
        customerName: '홍길동',
        customerPhone: '010-1234-5678',
        shippingAddress: {
          zipCode: '06232',
          address: '서울시 강남구',
        },
      },
      ...overrides,
    },
  } as Job<OrderJobData>
}

describe('createOrderWorker — 보안 검증', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCapturedProcessor = null
    process.env['ACCOUNT_ID'] = 'default'
    ;(getSetting as jest.Mock).mockReturnValue('true')
    mockConfig.autoWholesaleOrderEnabled = true
  })

  // ---- 전화번호 암호화 검증 ----

  it('전화번호가 encryptPhone()을 통해 암호화되어 DB에 저장됨', async () => {
    createOrderWorker()
    expect(mockCapturedProcessor).not.toBeNull()

    await mockCapturedProcessor!(makeOrderJob('order-001'))

    // encryptPhone이 정확한 전화번호로 호출됨
    expect(mockEncryptPhone).toHaveBeenCalledWith('010-1234-5678')
    expect(mockEncryptPhone).toHaveBeenCalledTimes(1)

    // DB에 암호화된 3개 필드로 저장됨
    expect(mockOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerPhoneCiphertext: 'enc_cipher_base64',
          customerPhoneIv: 'enc_iv_base64',
          customerPhoneAuthTag: 'enc_tag_base64',
        }),
      }),
    )
  })

  it('전화번호 없는 주문(webhook) → 빈 문자열 페이로드 저장, encryptPhone 미호출', async () => {
    const { mapNaverOrderToInternal } = jest.requireMock('@smartstore/integrations') as {
      mapNaverOrderToInternal: jest.Mock
    }
    mapNaverOrderToInternal.mockReturnValueOnce({
      quantity: 1,
      salePrice: 15000,
      customerName: '김철수',
      customerPhone: '', // 전화번호 없음
      customerAddress: '부산시',
      status: 'paid',
      orderedAt: new Date(),
      paidAt: new Date(),
    })

    createOrderWorker()
    await mockCapturedProcessor!(makeOrderJob('order-002'))

    // 빈 전화번호 → encryptPhone 미호출
    expect(mockEncryptPhone).not.toHaveBeenCalled()

    // 빈 문자열 페이로드 저장
    expect(mockOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerPhoneCiphertext: '',
          customerPhoneIv: '',
          customerPhoneAuthTag: '',
        }),
      }),
    )
  })

  it('평문 전화번호가 DB create 데이터에 절대 포함되지 않음', async () => {
    createOrderWorker()
    await mockCapturedProcessor!(makeOrderJob('order-003'))

    const createCall = mockOrderCreate.mock.calls[0]![0] as { data: Record<string, unknown> }
    const dataValues = Object.values(createCall.data)

    // 평문 전화번호가 DB 저장 데이터에 없음
    expect(dataValues).not.toContain('010-1234-5678')
    // customerPhone 평문 필드 자체가 없음
    expect(createCall.data).not.toHaveProperty('customerPhone')
  })

  // ---- Kill Switch 검증 ----

  it('AUTO_ORDER_ENABLED=false → 주문 처리 스킵', async () => {
    ;(getSetting as jest.Mock).mockReturnValue('false')

    createOrderWorker()
    const result = await mockCapturedProcessor!(makeOrderJob('order-004'))

    expect(result).toEqual({ skipped: true, reason: 'kill-switch' })
    expect(mockOrderCreate).not.toHaveBeenCalled()
  })

  // ---- 중복 주문 스킵 ----

  it('이미 존재하는 주문 → 스킵', async () => {
    mockOrderFindUnique.mockResolvedValueOnce({ id: 'existing-order' })

    createOrderWorker()
    const result = await mockCapturedProcessor!(makeOrderJob('order-005'))

    expect(result).toEqual({ skipped: true, orderId: 'existing-order' })
    expect(mockEncryptPhone).not.toHaveBeenCalled()
  })

  // ---- 도매 자동 발주 검증 ----

  it('autoWholesaleOrderEnabled=true + product.source 존재 → wholesaleOrderQueue.add 호출', async () => {
    // ORDER_APPROVAL_MODE=false로 자동 모드 진입
    ;(getSetting as jest.Mock).mockImplementation((key: string) =>
      key === 'ORDER_APPROVAL_MODE' ? 'false' : 'true'
    )

    createOrderWorker()
    await mockCapturedProcessor!(makeOrderJob('order-wholesale-1'))

    expect(mockWholesaleOrderQueueAdd).toHaveBeenCalledTimes(1)
    expect(mockWholesaleOrderQueueAdd).toHaveBeenCalledWith(
      'place-order',
      expect.objectContaining({
        orderId: 'order-1',
        source: 'domaegguk',
        sourceProductId: 'dmg-001',
        quantity: 1,
        shippingAddress: expect.objectContaining({
          name: '홍길동',
          phone: '010-1234-5678',
        }),
      }),
      { jobId: 'wholesale-order-1' },
    )
  })

  it('autoWholesaleOrderEnabled=false → wholesaleOrderQueue.add 미호출', async () => {
    mockConfig.autoWholesaleOrderEnabled = false
    ;(getSetting as jest.Mock).mockImplementation((key: string) =>
      key === 'ORDER_APPROVAL_MODE' ? 'false' : 'true'
    )

    createOrderWorker()
    await mockCapturedProcessor!(makeOrderJob('order-wholesale-2'))

    expect(mockWholesaleOrderQueueAdd).not.toHaveBeenCalled()
  })

  it('product.source 없음 → wholesaleOrderQueue.add 미호출', async () => {
    ;(getSetting as jest.Mock).mockImplementation((key: string) =>
      key === 'ORDER_APPROVAL_MODE' ? 'false' : 'true'
    )

    const { prisma: mockPrisma } = jest.requireMock('@smartstore/db') as {
      prisma: { product: { findFirst: jest.Mock } }
    }
    mockPrisma.product.findFirst.mockResolvedValueOnce({
      id: 'prod-no-source',
      name: '소스 없는 상품',
      naverProductId: 'naver-456',
      salePrice: 15000,
      wholesalePrice: 10000,
      shippingFee: 2500,
      naverFeeRate: 0.05,
      source: null,
      sourceProductId: null,
    })

    createOrderWorker()
    await mockCapturedProcessor!(makeOrderJob('order-wholesale-3'))

    expect(mockWholesaleOrderQueueAdd).not.toHaveBeenCalled()
  })

  // ---- 마진 계산 검증 ----

  it('마진율이 정확히 계산되어 DB에 저장됨', async () => {
    createOrderWorker()
    await mockCapturedProcessor!(makeOrderJob('order-006'))

    // salePrice: 15000, wholesalePrice: 10000, shippingFee: 2500, feeRate: 0.05
    // fee = 15000 * 0.05 = 750
    // wholesaleCost = 10000 + 2500 = 12500
    // marginAmount = 15000 - 12500 - 750 = 1750
    // marginRate = 1750 / 15000 ≈ 0.1167
    expect(mockOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          marginAmount: 1750,
          marginRate: 0.1167,
        }),
      }),
    )
  })
})

// =============================================
// console.log 부재 검증 (소스 코드 정적 분석)
// =============================================

describe('order.job.ts — console.log 부재 검증', () => {
  it('소스 파일에 console.log가 없음 (민감 데이터 노출 방지)', () => {
    const filePath = path.resolve(__dirname, './order.job.ts')
    const source = fs.readFileSync(filePath, 'utf8')

    // console.log, console.warn, console.error 등 직접 사용 금지
    // 모든 로깅은 createLogger()를 통해야 함
    const consoleUsages = source.match(/console\.(log|warn|error|info)\(/g)
    expect(consoleUsages).toBeNull()
  })
})
