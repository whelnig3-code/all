// =============================================
// 재고 예약 서비스 테스트 (RED → GREEN)
// - Prisma 의존성은 mock 처리
// - 순수 비즈니스 로직 검증
// =============================================

// mock 함수를 jest.mock보다 먼저 선언 (hoisting 대응)
const mockUpdate = jest.fn()
const mockCreate = jest.fn()
const mockQueryRaw = jest.fn()

jest.mock('@smartstore/db', () => ({
  prisma: {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        product: {
          update: mockUpdate,
        },
        inventoryEvent: {
          create: mockCreate,
        },
        $queryRaw: mockQueryRaw,
      }
      return fn(tx)
    }),
  },
}))

import {
  reserveStock,
  releaseStock,
  confirmStockDeduction,
} from './stock-reservation.service'

const mockProduct = {
  id: 'prod-1',
  cachedStock: 10,
  reservedStock: 2,
  supplierStock: 10,
  listingPaused: false,
}

beforeEach(() => {
  jest.clearAllMocks()
  mockQueryRaw.mockResolvedValue([{ ...mockProduct }])
  mockUpdate.mockResolvedValue({ ...mockProduct })
  mockCreate.mockResolvedValue({})
})

describe('reserveStock', () => {
  it('가용 재고 충분 시 예약 성공 (ok: true)', async () => {
    // available = 10 - 2 = 8, qty = 3 → 성공
    const result = await reserveStock('prod-1', 3)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.productId).toBe('prod-1')
      expect(result.value.reservedQty).toBe(3)
    }
  })

  it('가용 재고 부족 시 예약 실패 (ok: false)', async () => {
    // available = 10 - 2 = 8, qty = 10 → 실패
    const result = await reserveStock('prod-1', 10)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toContain('재고 부족')
    }
  })

  it('수량 0 이하 시 에러', async () => {
    const result = await reserveStock('prod-1', 0)

    expect(result.ok).toBe(false)
  })

  it('상품 미존재 시 에러', async () => {
    mockQueryRaw.mockResolvedValueOnce([])

    const result = await reserveStock('nonexistent', 1)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toContain('상품')
    }
  })

  it('예약 시 reservedStock 증가 + InventoryEvent 기록', async () => {
    await reserveStock('prod-1', 3)

    // update 호출 확인: reservedStock이 증가했어야 함
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prod-1' },
        data: expect.objectContaining({
          reservedStock: 5, // 2 + 3
        }),
      })
    )

    // InventoryEvent 생성 확인
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: 'prod-1',
          type: 'reserve',
          reservedDelta: 3,
        }),
      })
    )
  })
})

describe('releaseStock', () => {
  it('예약 해제 성공 (reservedStock 감소)', async () => {
    // reservedStock = 2, release 1 → 1
    const result = await releaseStock('prod-1', 1)

    expect(result.ok).toBe(true)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reservedStock: 1, // 2 - 1
        }),
      })
    )
  })

  it('해제 수량이 reservedStock보다 크면 0으로 설정', async () => {
    // reservedStock = 2, release 5 → 0 (음수 방지)
    const result = await releaseStock('prod-1', 5)

    expect(result.ok).toBe(true)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reservedStock: 0,
        }),
      })
    )
  })

  it('InventoryEvent type=release 기록', async () => {
    await releaseStock('prod-1', 1)

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'release',
          reservedDelta: -1,
        }),
      })
    )
  })

  it('상품 미존재 시 에러', async () => {
    mockQueryRaw.mockResolvedValueOnce([])

    const result = await releaseStock('nonexistent', 1)
    expect(result.ok).toBe(false)
  })
})

describe('confirmStockDeduction', () => {
  it('확정 차감: cachedStock, reservedStock 동시 감소', async () => {
    // cachedStock=10, reservedStock=2, qty=2
    const result = await confirmStockDeduction('prod-1', 2)

    expect(result.ok).toBe(true)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cachedStock: 8,     // 10 - 2
          reservedStock: 0,   // 2 - 2
        }),
      })
    )
  })

  it('InventoryEvent type=order_decrement 기록', async () => {
    await confirmStockDeduction('prod-1', 2)

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'order_decrement',
          previousStock: 10,
          newStock: 8,
        }),
      })
    )
  })

  it('상품 미존재 시 에러', async () => {
    mockQueryRaw.mockResolvedValueOnce([])

    const result = await confirmStockDeduction('nonexistent', 1)
    expect(result.ok).toBe(false)
  })
})
