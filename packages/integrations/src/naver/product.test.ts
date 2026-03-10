// =============================================
// 네이버 상품 등록/수정 모듈 단위 테스트
// - 단일/배치 등록
// - 설명/가격 업데이트
// - Rate limit sleep 모킹 (즉시 resolve)
// =============================================

// setTimeout을 즉시 실행하도록 mock — sleep(1000)이 지연 없이 resolve
const originalSetTimeout = global.setTimeout
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.setTimeout = ((fn: () => void) => {
  fn()
  return 0 as unknown as NodeJS.Timeout
}) as any

// @smartstore/shared mock
jest.mock('@smartstore/shared', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}))

// commerce-api mock
const mockRegisterProduct = jest.fn()
const mockUpdateProduct = jest.fn()
const mockUpdatePrice = jest.fn()

jest.mock('./commerce-api', () => ({
  naverCommerceApi: {
    registerProduct: (...args: unknown[]) => mockRegisterProduct(...args),
    updateProduct: (...args: unknown[]) => mockUpdateProduct(...args),
    updatePrice: (...args: unknown[]) => mockUpdatePrice(...args),
  },
}))

import type { NaverProduct } from '@smartstore/shared'
import {
  registerProductToNaver,
  registerProductsBatch,
  updateProductDescription,
  updateProductPrice,
} from './product'

// =============================================
// 헬퍼
// =============================================

function createMockProduct(overrides: Partial<NaverProduct> = {}): NaverProduct {
  return {
    name: '테스트 상품',
    salePrice: 15000,
    category: { id: 'cat-001', name: '생활용품' },
    images: ['https://img.example.com/main.jpg'],
    description: '<p>상품 설명입니다</p>',
    stockQuantity: 100,
    deliveryInfo: {
      deliveryFee: 0,
      deliveryType: 'FREE',
    },
    ...overrides,
  }
}

// =============================================
// 테스트
// =============================================

describe('product.ts', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterAll(() => {
    global.setTimeout = originalSetTimeout
  })

  // ----- registerProductToNaver -----

  describe('registerProductToNaver', () => {
    it('성공 시 originProductNo를 포함한 결과를 반환한다', async () => {
      mockRegisterProduct.mockResolvedValue({
        originProductNo: 12345,
        smartstoreChannelProductNo: 67890,
      })

      const product = createMockProduct()
      const result = await registerProductToNaver(product)

      expect(result).toEqual({
        success: true,
        originProductNo: 12345,
        smartstoreChannelProductNo: 67890,
      })
      expect(mockRegisterProduct).toHaveBeenCalledTimes(1)
    })

    it('실패 시 error 메시지를 포함한 결과를 반환한다', async () => {
      mockRegisterProduct.mockRejectedValue(new Error('API 호출 실패'))

      const product = createMockProduct({ name: '실패 상품' })
      const result = await registerProductToNaver(product)

      expect(result).toEqual({
        success: false,
        error: 'API 호출 실패',
      })
    })
  })

  // ----- registerProductsBatch -----

  describe('registerProductsBatch', () => {
    it('모든 상품을 순차적으로 등록한다', async () => {
      mockRegisterProduct
        .mockResolvedValueOnce({ originProductNo: 1, smartstoreChannelProductNo: 10 })
        .mockResolvedValueOnce({ originProductNo: 2, smartstoreChannelProductNo: 20 })
        .mockResolvedValueOnce({ originProductNo: 3, smartstoreChannelProductNo: 30 })

      const products = [
        createMockProduct({ name: '상품1' }),
        createMockProduct({ name: '상품2' }),
        createMockProduct({ name: '상품3' }),
      ]

      const results = await registerProductsBatch(products)

      expect(results).toHaveLength(3)
      expect(mockRegisterProduct).toHaveBeenCalledTimes(3)
      expect(results.every((r) => r.success)).toBe(true)
    })

    it('성공 건수를 정확히 카운트한다', async () => {
      mockRegisterProduct
        .mockResolvedValueOnce({ originProductNo: 1, smartstoreChannelProductNo: 10 })
        .mockRejectedValueOnce(new Error('등록 실패'))
        .mockResolvedValueOnce({ originProductNo: 3, smartstoreChannelProductNo: 30 })

      const products = [
        createMockProduct({ name: '성공1' }),
        createMockProduct({ name: '실패' }),
        createMockProduct({ name: '성공2' }),
      ]

      const results = await registerProductsBatch(products)

      expect(results).toHaveLength(3)
      const successCount = results.filter((r) => r.success).length
      expect(successCount).toBe(2)
      expect(results[1].success).toBe(false)
      expect(results[1].error).toBe('등록 실패')
    })
  })

  // ----- updateProductDescription -----

  describe('updateProductDescription', () => {
    it('성공 시 true를 반환한다', async () => {
      mockUpdateProduct.mockResolvedValue(undefined)

      const result = await updateProductDescription(12345, '<p>새 설명</p>')

      expect(result).toBe(true)
      expect(mockUpdateProduct).toHaveBeenCalledWith(12345, {
        detailContent: '<p>새 설명</p>',
      })
    })

    it('실패 시 false를 반환한다', async () => {
      mockUpdateProduct.mockRejectedValue(new Error('업데이트 실패'))

      const result = await updateProductDescription(99999, '<p>실패</p>')

      expect(result).toBe(false)
    })
  })

  // ----- updateProductPrice -----

  describe('updateProductPrice', () => {
    it('성공 시 true를 반환한다', async () => {
      mockUpdatePrice.mockResolvedValue(undefined)

      const result = await updateProductPrice(12345, 29900)

      expect(result).toBe(true)
      expect(mockUpdatePrice).toHaveBeenCalledWith({
        originProductNo: 12345,
        salePrice: 29900,
      })
    })

    it('실패 시 false를 반환한다', async () => {
      mockUpdatePrice.mockRejectedValue(new Error('가격 변경 실패'))

      const result = await updateProductPrice(99999, 10000)

      expect(result).toBe(false)
    })
  })
})
