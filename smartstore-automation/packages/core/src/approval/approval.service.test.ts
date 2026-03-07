// =============================================
// 주문 승인 서비스 테스트 (Phase 4.5 — TDD RED → GREEN)
// - Prisma, Telegram, BullMQ 의존성 mock
// - 승인 전이의 정확성/멱등성/보안 검증
// =============================================

// mock 함수 선언 (hoisting 대응)
const mockFindUniqueOrder = jest.fn()
const mockCreateApproval = jest.fn()
const mockFindUniqueApproval = jest.fn()
const mockUpdateApproval = jest.fn()
const mockCreateEvent = jest.fn()
const mockUpdateOrder = jest.fn()
const mockUpdateProduct = jest.fn()
const mockFindManyProducts = jest.fn()
const mockUpdateManyProducts = jest.fn()
const mockQueryRaw = jest.fn()

// stock-reservation mock
const mockReserveStock = jest.fn()
const mockReleaseStock = jest.fn()
const mockConfirmStockDeduction = jest.fn()

// telegram mock
const mockSendMessageWithButtons = jest.fn()
const mockEditMessageText = jest.fn()

// queue mock
const mockQueueAdd = jest.fn()

jest.mock('@smartstore/db', () => ({
  prisma: {
    $transaction: jest.fn(async (fn) => {
      const tx = {
        order: {
          findUnique: mockFindUniqueOrder,
          update: mockUpdateOrder,
        },
        orderApproval: {
          create: mockCreateApproval,
          findUnique: mockFindUniqueApproval,
          update: mockUpdateApproval,
        },
        approvalEvent: {
          create: mockCreateEvent,
        },
        product: {
          update: mockUpdateProduct,
          findMany: mockFindManyProducts,
          updateMany: mockUpdateManyProducts,
        },
        $queryRaw: mockQueryRaw,
      }
      return fn(tx)
    }),
    orderApproval: {
      findUnique: mockFindUniqueApproval,
    },
    product: {
      findMany: mockFindManyProducts,
      updateMany: mockUpdateManyProducts,
    },
  },
}))

jest.mock('../inventory/stock-reservation.service', () => ({
  reserveStock: (...args) => mockReserveStock(...args),
  releaseStock: (...args) => mockReleaseStock(...args),
  confirmStockDeduction: (...args) => mockConfirmStockDeduction(...args),
}))

jest.mock('@smartstore/adapters', () => ({
  sendMessageWithButtons: (...args) => mockSendMessageWithButtons(...args),
  editMessageText: (...args) => mockEditMessageText(...args),
}))

import {
  createApprovalRequest,
  approveOrder,
  rejectOrder,
  handleApprovalTimeout,
  cleanExpiredReservations,
} from './approval.service'

// =============================================
// 테스트 데이터
// =============================================

const mockOrder = {
  id: 'order-1',
  naverOrderId: 'naver-order-1',
  productId: 'prod-1',
  quantity: 1,
  salePrice: 19240,
  totalAmount: 19240,
  status: 'paid',
  customerName: '홍길동',
  product: {
    id: 'prod-1',
    name: 'USB 케이블 1m',
    wholesalePrice: 12500,
    shippingFee: 0,
    naverFeeRate: 0.05,
    cachedStock: 15,
    reservedStock: 0,
    supplierStock: 15,
  },
}

const mockApproval = {
  id: 'approval-1',
  orderId: 'order-1',
  status: 'pending',
  approvalToken: 'test-token-uuid',
  telegramMessageId: 123,
  expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  createdAt: new Date(),
  order: mockOrder,
}

beforeEach(() => {
  jest.clearAllMocks()
  // 기본 성공 응답 설정
  mockFindUniqueOrder.mockResolvedValue({ ...mockOrder })
  mockCreateApproval.mockResolvedValue({ ...mockApproval })
  mockFindUniqueApproval.mockResolvedValue({ ...mockApproval })
  mockUpdateApproval.mockResolvedValue({ ...mockApproval, status: 'approved' })
  mockCreateEvent.mockResolvedValue({})
  mockUpdateOrder.mockResolvedValue({})
  mockUpdateProduct.mockResolvedValue({})
  mockReserveStock.mockResolvedValue({ ok: true, value: { productId: 'prod-1', reservedQty: 1, availableStock: 14, reservedStock: 1 } })
  mockReleaseStock.mockResolvedValue({ ok: true, value: undefined })
  mockConfirmStockDeduction.mockResolvedValue({ ok: true, value: undefined })
  mockSendMessageWithButtons.mockResolvedValue(123) // messageId
  mockEditMessageText.mockResolvedValue(undefined)
  mockQueueAdd.mockResolvedValue({})
})

// =============================================
// createApprovalRequest
// =============================================

describe('createApprovalRequest', () => {
  it('주문 존재 시 승인 요청 생성 (ok: true)', async () => {
    const result = await createApprovalRequest('order-1', mockQueueAdd)

    expect(result.ok).toBe(true)
  })

  it('주문 미존재 시 실패', async () => {
    mockFindUniqueOrder.mockResolvedValueOnce(null)

    const result = await createApprovalRequest('nonexistent', mockQueueAdd)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toContain('주문')
    }
  })

  it('OrderApproval 생성 시 approvalToken (UUID 형식) 포함', async () => {
    await createApprovalRequest('order-1', mockQueueAdd)

    expect(mockCreateApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'order-1',
          status: 'pending',
          approvalToken: expect.any(String),
        }),
      })
    )
  })

  it('expiresAt가 현재 시간 + 5분으로 설정', async () => {
    const before = Date.now()
    await createApprovalRequest('order-1', mockQueueAdd)
    const after = Date.now()

    const callArgs = mockCreateApproval.mock.calls[0][0]
    const expiresAt = callArgs.data.expiresAt.getTime()

    // 5분(300000ms) ± 1초 허용
    expect(expiresAt).toBeGreaterThanOrEqual(before + 300000 - 1000)
    expect(expiresAt).toBeLessThanOrEqual(after + 300000 + 1000)
  })

  it('reserveStock 호출 + reservedUntil 설정', async () => {
    await createApprovalRequest('order-1', mockQueueAdd)

    // 재고 예약 호출 확인
    expect(mockReserveStock).toHaveBeenCalledWith('prod-1', 1)

    // reservedUntil 설정 확인
    expect(mockUpdateProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prod-1' },
        data: expect.objectContaining({
          reservedUntil: expect.any(Date),
        }),
      })
    )
  })

  it('재고 예약 실패 시 승인 요청 생성 실패', async () => {
    mockReserveStock.mockResolvedValueOnce({
      ok: false,
      error: new Error('재고 부족'),
    })

    const result = await createApprovalRequest('order-1', mockQueueAdd)

    expect(result.ok).toBe(false)
  })

  it('텔레그램 인라인 키보드 전송', async () => {
    await createApprovalRequest('order-1', mockQueueAdd)

    expect(mockSendMessageWithButtons).toHaveBeenCalled()
    const [, text, buttons] = mockSendMessageWithButtons.mock.calls[0]
    expect(text).toContain('승인 요청')
    expect(buttons).toBeDefined()
  })

  it('ApprovalEvent (action=created) 기록', async () => {
    await createApprovalRequest('order-1', mockQueueAdd)

    expect(mockCreateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'order-1',
          action: 'created',
        }),
      })
    )
  })

  it('BullMQ delayed job (5분 후 check_timeout) 스케줄', async () => {
    await createApprovalRequest('order-1', mockQueueAdd)

    expect(mockQueueAdd).toHaveBeenCalledWith(
      'check_timeout',
      expect.objectContaining({
        orderId: 'order-1',
        approvalToken: expect.any(String),
        action: 'check_timeout',
      }),
      expect.objectContaining({
        delay: expect.any(Number),
      })
    )
  })

  it('margin < 15% 인 주문 → 자동 거부', async () => {
    // margin = (19240 - 12500 - 962) / 19240 = 0.30 → 정상
    // 판매가를 낮춰서 마진 15% 미만 만들기
    mockFindUniqueOrder.mockResolvedValueOnce({
      ...mockOrder,
      salePrice: 13000,
      totalAmount: 13000,
      product: {
        ...mockOrder.product,
        wholesalePrice: 12500,
      },
    })

    const result = await createApprovalRequest('order-1', mockQueueAdd)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toContain('마진')
    }
  })
})

// =============================================
// approveOrder
// =============================================

describe('approveOrder', () => {
  it('올바른 토큰 + status=pending → 승인 성공', async () => {
    const result = await approveOrder('order-1', 'test-token-uuid')

    expect(result.ok).toBe(true)
  })

  it('잘못된 토큰 → 실패', async () => {
    const result = await approveOrder('order-1', 'wrong-token')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toContain('토큰')
    }
  })

  it('이미 승인됨 → 멱등 반환 (에러 없이 ok: true)', async () => {
    mockFindUniqueApproval.mockResolvedValueOnce({
      ...mockApproval,
      status: 'approved',
    })

    const result = await approveOrder('order-1', 'test-token-uuid')

    expect(result.ok).toBe(true)
    // update는 호출되지 않아야 함
    expect(mockUpdateApproval).not.toHaveBeenCalled()
  })

  it('승인 시 confirmStockDeduction 호출', async () => {
    await approveOrder('order-1', 'test-token-uuid')

    expect(mockConfirmStockDeduction).toHaveBeenCalledWith('prod-1', 1)
  })

  it('승인 시 Order status → preparing', async () => {
    await approveOrder('order-1', 'test-token-uuid')

    expect(mockUpdateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'preparing',
        }),
      })
    )
  })

  it('승인 시 reservedUntil → null 초기화', async () => {
    await approveOrder('order-1', 'test-token-uuid')

    expect(mockUpdateProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reservedUntil: null,
        }),
      })
    )
  })

  it('ApprovalEvent (action=approved) 기록', async () => {
    await approveOrder('order-1', 'test-token-uuid')

    expect(mockCreateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'order-1',
          action: 'approved',
        }),
      })
    )
  })

  it('텔레그램 메시지 편집 (✅ 승인됨)', async () => {
    await approveOrder('order-1', 'test-token-uuid')

    expect(mockEditMessageText).toHaveBeenCalled()
    const [, , text] = mockEditMessageText.mock.calls[0]
    expect(text).toContain('승인')
  })

  it('승인 미존재 시 실패', async () => {
    mockFindUniqueApproval.mockResolvedValueOnce(null)

    const result = await approveOrder('order-1', 'test-token-uuid')

    expect(result.ok).toBe(false)
  })
})

// =============================================
// rejectOrder
// =============================================

describe('rejectOrder', () => {
  it('올바른 토큰 + status=pending → 거부 성공', async () => {
    const result = await rejectOrder('order-1', 'test-token-uuid', '재고 불확실')

    expect(result.ok).toBe(true)
  })

  it('잘못된 토큰 → 실패', async () => {
    const result = await rejectOrder('order-1', 'wrong-token')

    expect(result.ok).toBe(false)
  })

  it('이미 거부됨 → 멱등 반환', async () => {
    mockFindUniqueApproval.mockResolvedValueOnce({
      ...mockApproval,
      status: 'rejected',
    })

    const result = await rejectOrder('order-1', 'test-token-uuid')

    expect(result.ok).toBe(true)
    expect(mockUpdateApproval).not.toHaveBeenCalled()
  })

  it('거부 시 releaseStock 호출', async () => {
    await rejectOrder('order-1', 'test-token-uuid')

    expect(mockReleaseStock).toHaveBeenCalledWith('prod-1', 1)
  })

  it('거부 시 Order status → cancelled', async () => {
    await rejectOrder('order-1', 'test-token-uuid')

    expect(mockUpdateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'cancelled',
        }),
      })
    )
  })

  it('거부 시 reservedUntil → null', async () => {
    await rejectOrder('order-1', 'test-token-uuid')

    expect(mockUpdateProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reservedUntil: null,
        }),
      })
    )
  })

  it('ApprovalEvent (action=rejected) + rejectReason 기록', async () => {
    await rejectOrder('order-1', 'test-token-uuid', '재고 불확실')

    expect(mockCreateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'rejected',
          metadata: expect.objectContaining({
            reason: '재고 불확실',
          }),
        }),
      })
    )
  })
})

// =============================================
// handleApprovalTimeout
// =============================================

describe('handleApprovalTimeout', () => {
  it('status=pending → 타임아웃 처리', async () => {
    const result = await handleApprovalTimeout('order-1')

    expect(result.ok).toBe(true)
  })

  it('이미 approved → 무시 (ok: true)', async () => {
    mockFindUniqueApproval.mockResolvedValueOnce({
      ...mockApproval,
      status: 'approved',
    })

    const result = await handleApprovalTimeout('order-1')

    expect(result.ok).toBe(true)
    expect(mockUpdateApproval).not.toHaveBeenCalled()
  })

  it('이미 rejected → 무시', async () => {
    mockFindUniqueApproval.mockResolvedValueOnce({
      ...mockApproval,
      status: 'rejected',
    })

    const result = await handleApprovalTimeout('order-1')

    expect(result.ok).toBe(true)
    expect(mockUpdateApproval).not.toHaveBeenCalled()
  })

  it('타임아웃 시 releaseStock 호출', async () => {
    await handleApprovalTimeout('order-1')

    expect(mockReleaseStock).toHaveBeenCalledWith('prod-1', 1)
  })

  it('타임아웃 시 Order status → cancelled', async () => {
    await handleApprovalTimeout('order-1')

    expect(mockUpdateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'cancelled',
        }),
      })
    )
  })

  it('ApprovalEvent (action=timeout) 기록', async () => {
    await handleApprovalTimeout('order-1')

    expect(mockCreateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'timeout',
        }),
      })
    )
  })

  it('승인 미존재 시 무시 (ok: true)', async () => {
    mockFindUniqueApproval.mockResolvedValueOnce(null)

    const result = await handleApprovalTimeout('order-1')

    expect(result.ok).toBe(true)
  })
})

// =============================================
// cleanExpiredReservations
// =============================================

describe('cleanExpiredReservations', () => {
  it('만료된 예약이 있으면 정리', async () => {
    mockFindManyProducts.mockResolvedValueOnce([
      { id: 'prod-1', reservedStock: 3 },
      { id: 'prod-2', reservedStock: 1 },
    ])
    mockUpdateManyProducts.mockResolvedValueOnce({ count: 2 })

    const count = await cleanExpiredReservations()

    expect(count).toBe(2)
  })

  it('만료된 예약이 없으면 0 반환', async () => {
    mockFindManyProducts.mockResolvedValueOnce([])

    const count = await cleanExpiredReservations()

    expect(count).toBe(0)
  })
})
