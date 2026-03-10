// =============================================
// 판매 중지/재개 서비스 테스트
// =============================================

const mockFindUnique = jest.fn()
const mockProductUpdate = jest.fn()
const mockEventCreate = jest.fn()

jest.mock('@smartstore/db', () => ({
  prisma: {
    product: {
      findUnique: mockFindUnique,
      update: mockProductUpdate,
    },
    inventoryEvent: {
      create: mockEventCreate,
    },
  },
}))

import { pauseListing, resumeListing } from './listing-control.service'

const baseProduct = {
  id: 'prod-1',
  cachedStock: 10,
  listingPaused: false,
}

beforeEach(() => {
  jest.clearAllMocks()
  mockFindUnique.mockResolvedValue({ ...baseProduct })
  mockProductUpdate.mockResolvedValue({})
  mockEventCreate.mockResolvedValue({})
})

describe('pauseListing', () => {
  it('판매 중지 성공: status=suspended, listingPaused=true', async () => {
    const result = await pauseListing('prod-1')

    expect(result.ok).toBe(true)
    expect(mockProductUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prod-1' },
        data: expect.objectContaining({
          listingPaused: true,
          status: 'suspended',
        }),
      })
    )
  })

  it('InventoryEvent type=pause 기록', async () => {
    await pauseListing('prod-1', '안전 재고 이하')

    expect(mockEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: 'prod-1',
          type: 'pause',
          reason: '안전 재고 이하',
        }),
      })
    )
  })

  it('이미 중지된 상품은 중복 처리하지 않음 (멱등성)', async () => {
    mockFindUnique.mockResolvedValueOnce({ ...baseProduct, listingPaused: true })

    const result = await pauseListing('prod-1')

    expect(result.ok).toBe(true)
    expect(mockProductUpdate).not.toHaveBeenCalled()
    expect(mockEventCreate).not.toHaveBeenCalled()
  })

  it('상품 미존재 시 에러', async () => {
    mockFindUnique.mockResolvedValueOnce(null)

    const result = await pauseListing('nonexistent')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toContain('상품')
    }
  })
})

describe('resumeListing', () => {
  it('판매 재개 성공: status=active, listingPaused=false', async () => {
    mockFindUnique.mockResolvedValueOnce({ ...baseProduct, listingPaused: true })

    const result = await resumeListing('prod-1')

    expect(result.ok).toBe(true)
    expect(mockProductUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prod-1' },
        data: expect.objectContaining({
          listingPaused: false,
          status: 'active',
          listingPausedAt: null,
        }),
      })
    )
  })

  it('InventoryEvent type=resume 기록', async () => {
    mockFindUnique.mockResolvedValueOnce({ ...baseProduct, listingPaused: true })

    await resumeListing('prod-1', '재고 복구')

    expect(mockEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: 'prod-1',
          type: 'resume',
          reason: '재고 복구',
        }),
      })
    )
  })

  it('이미 판매 중인 상품은 중복 처리하지 않음 (멱등성)', async () => {
    // baseProduct.listingPaused = false (기본)
    const result = await resumeListing('prod-1')

    expect(result.ok).toBe(true)
    expect(mockProductUpdate).not.toHaveBeenCalled()
    expect(mockEventCreate).not.toHaveBeenCalled()
  })

  it('상품 미존재 시 에러', async () => {
    mockFindUnique.mockResolvedValueOnce(null)

    const result = await resumeListing('nonexistent')

    expect(result.ok).toBe(false)
  })
})
