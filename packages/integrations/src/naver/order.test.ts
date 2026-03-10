// =============================================
// 네이버 주문 처리 서비스 단위 테스트
// - 새 주문 조회
// - 주문 상태 변환
// - 발송 처리
// - 일괄 발송
// =============================================

// commerce-api mock
const mockGetNewOrders = jest.fn()
const mockConfirmShipping = jest.fn()

jest.mock('./commerce-api', () => ({
  naverCommerceApi: {
    getNewOrders: (...args: unknown[]) => mockGetNewOrders(...args),
    confirmShipping: (...args: unknown[]) => mockConfirmShipping(...args),
  },
}))

// @smartstore/shared mock
jest.mock('@smartstore/shared', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}))

import {
  fetchNewOrders,
  mapNaverOrderToInternal,
  confirmShipping,
  confirmShippingBatch,
} from './order'
import type { NaverOrderItem } from './types'

// =============================================
// 헬퍼
// =============================================

function createOrderItem(overrides: Partial<NaverOrderItem> = {}): NaverOrderItem {
  return {
    productOrderId: 'PO-001',
    orderId: 'ORD-001',
    productId: 'PROD-001',
    productName: '테스트 상품',
    quantity: 1,
    salePrice: 10000,
    productOrderStatus: 'PAY_DONE',
    deliveryStatus: 'NOT_YET',
    shippingAddress: {
      name: '홍길동',
      tel: '010-1234-5678',
      zipCode: '12345',
      baseAddress: '서울시 강남구',
      detailAddress: '101호',
    },
    orderDate: '2026-03-01T10:00:00Z',
    paymentDate: '2026-03-01T10:05:00Z',
    ...overrides,
  }
}

// =============================================
// fetchNewOrders
// =============================================

describe('fetchNewOrders', () => {
  beforeEach(() => {
    mockGetNewOrders.mockReset()
  })

  it('API에서 주문 목록 반환', async () => {
    const items = [createOrderItem(), createOrderItem({ productOrderId: 'PO-002' })]
    mockGetNewOrders.mockResolvedValueOnce({ data: items })

    const result = await fetchNewOrders()

    expect(result).toEqual(items)
    expect(result).toHaveLength(2)
  })

  it('API 오류 시 빈 배열 반환', async () => {
    mockGetNewOrders.mockRejectedValueOnce(new Error('API error'))

    const result = await fetchNewOrders()

    expect(result).toEqual([])
  })
})

// =============================================
// mapNaverOrderToInternal
// =============================================

describe('mapNaverOrderToInternal', () => {
  it('PAY_DONE → "paid" 상태 변환', () => {
    const result = mapNaverOrderToInternal(createOrderItem({ productOrderStatus: 'PAY_DONE' }))
    expect(result.status).toBe('paid')
  })

  it('DELIVERING → "shipped" 상태 변환', () => {
    const result = mapNaverOrderToInternal(createOrderItem({ productOrderStatus: 'DELIVERING' }))
    expect(result.status).toBe('shipped')
  })

  it('CANCELED → "cancelled" 상태 변환', () => {
    const result = mapNaverOrderToInternal(createOrderItem({ productOrderStatus: 'CANCELED' }))
    expect(result.status).toBe('cancelled')
  })

  it('고객 정보 추출 (이름, 전화번호, 주소)', () => {
    const item = createOrderItem()
    const result = mapNaverOrderToInternal(item)

    expect(result.customerName).toBe('홍길동')
    expect(result.customerPhone).toBe('010-1234-5678')
    expect(result.customerAddress).toBe('서울시 강남구 101호')
  })

  it('알 수 없는 상태 → "paid" 기본값', () => {
    const result = mapNaverOrderToInternal(createOrderItem({ productOrderStatus: 'UNKNOWN_STATUS' }))
    expect(result.status).toBe('paid')
  })

  it('기본 필드 매핑 (orderId, quantity, salePrice, 날짜)', () => {
    const item = createOrderItem({
      productOrderId: 'PO-100',
      productId: 'PROD-100',
      quantity: 3,
      salePrice: 25000,
      orderDate: '2026-03-05T12:00:00Z',
      paymentDate: '2026-03-05T12:05:00Z',
    })
    const result = mapNaverOrderToInternal(item)

    expect(result.orderId).toBe('PO-100')
    expect(result.naverProductId).toBe('PROD-100')
    expect(result.quantity).toBe(3)
    expect(result.salePrice).toBe(25000)
    expect(result.orderedAt).toEqual(new Date('2026-03-05T12:00:00Z'))
    expect(result.paidAt).toEqual(new Date('2026-03-05T12:05:00Z'))
  })
})

// =============================================
// confirmShipping
// =============================================

describe('confirmShipping', () => {
  beforeEach(() => {
    mockConfirmShipping.mockReset()
  })

  it('유효한 택배사로 발송 처리 성공', async () => {
    mockConfirmShipping.mockResolvedValueOnce(undefined)

    const result = await confirmShipping('PO-001', 'CJ대한통운', '1234567890')

    expect(result).toBe(true)
    expect(mockConfirmShipping).toHaveBeenCalledWith({
      dispatchProductOrders: [
        {
          productOrderId: 'PO-001',
          deliveryMethod: 'DELIVERY',
          deliveryCompanyCode: 'CJGLS',
          trackingNumber: '1234567890',
        },
      ],
    })
  })

  it('알 수 없는 택배사 → false 반환', async () => {
    const result = await confirmShipping('PO-001', '알 수 없는 택배사', '1234567890')

    expect(result).toBe(false)
    expect(mockConfirmShipping).not.toHaveBeenCalled()
  })

  it('API 오류 시 false 반환', async () => {
    mockConfirmShipping.mockRejectedValueOnce(new Error('API error'))

    const result = await confirmShipping('PO-001', 'CJ대한통운', '1234567890')

    expect(result).toBe(false)
  })
})

// =============================================
// confirmShippingBatch
// =============================================

describe('confirmShippingBatch', () => {
  beforeEach(() => {
    mockConfirmShipping.mockReset()
  })

  it('여러 배치로 분할 처리 (50건 초과)', async () => {
    // 60건: 50건 + 10건 배치
    const orders = Array.from({ length: 60 }, (_, i) => ({
      productOrderId: `PO-${i}`,
      courierName: 'CJ대한통운',
      trackingNumber: `TRACK-${i}`,
    }))

    mockConfirmShipping.mockResolvedValue(undefined)

    const result = await confirmShippingBatch(orders)

    expect(result.success).toBe(60)
    expect(result.failed).toBe(0)
    // 2 batch API calls
    expect(mockConfirmShipping).toHaveBeenCalledTimes(2)

    // 첫 번째 배치: 50건
    const firstCall = mockConfirmShipping.mock.calls[0][0]
    expect(firstCall.dispatchProductOrders).toHaveLength(50)

    // 두 번째 배치: 10건
    const secondCall = mockConfirmShipping.mock.calls[1][0]
    expect(secondCall.dispatchProductOrders).toHaveLength(10)
  })

  it('유효하지 않은 택배사 → failed 카운트 증가', async () => {
    const orders = [
      { productOrderId: 'PO-1', courierName: 'CJ대한통운', trackingNumber: 'T-1' },
      { productOrderId: 'PO-2', courierName: '없는택배사', trackingNumber: 'T-2' },
      { productOrderId: 'PO-3', courierName: '롯데택배', trackingNumber: 'T-3' },
    ]

    mockConfirmShipping.mockResolvedValue(undefined)

    const result = await confirmShippingBatch(orders)

    expect(result.success).toBe(2)
    expect(result.failed).toBe(1)
  })

  it('배치 API 오류 시 해당 배치 전체 failed 처리', async () => {
    const orders = [
      { productOrderId: 'PO-1', courierName: 'CJ대한통운', trackingNumber: 'T-1' },
      { productOrderId: 'PO-2', courierName: '한진택배', trackingNumber: 'T-2' },
    ]

    mockConfirmShipping.mockRejectedValueOnce(new Error('batch error'))

    const result = await confirmShippingBatch(orders)

    expect(result.success).toBe(0)
    expect(result.failed).toBe(2)
  })
})
