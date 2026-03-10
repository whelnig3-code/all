// =============================================
// 네이버 커머스 API 클라이언트 단위 테스트
// - OAuth 토큰 발급 및 캐싱
// - bcrypt 전자서명 생성
// - 상품/주문 API 호출 검증
// =============================================

// axios mock 설정
const mockAxiosInstance = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  patch: jest.fn(),
  interceptors: {
    request: { use: jest.fn() },
    response: { use: jest.fn() },
  },
}

const mockAxiosPost = jest.fn()

jest.mock('axios', () => {
  const create = jest.fn(() => mockAxiosInstance)
  return {
    __esModule: true,
    default: { create, post: mockAxiosPost },
    create,
    post: mockAxiosPost,
  }
})

jest.mock('bcrypt', () => ({
  __esModule: true,
  default: {
    hashSync: (password: string, salt: string) => `bcrypt_hashed_${password}`,
  },
}))

jest.mock('@smartstore/shared', () => ({
  config: {
    naver: {
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      shopId: 'test-shop-id',
      apiBaseUrl: 'https://api.commerce.naver.com',
    },
  },
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}))

import { NaverCommerceApiClient } from './commerce-api'

// =============================================
// 헬퍼
// =============================================

function createClient(): NaverCommerceApiClient {
  return new NaverCommerceApiClient(
    'test-client-id',
    'test-client-secret',
    'test-shop-id',
    'https://api.commerce.naver.com',
  )
}

function mockTokenResponse(expiresIn = 21600) {
  mockAxiosPost.mockResolvedValueOnce({
    data: {
      access_token: 'test-access-token',
      token_type: 'Bearer',
      expires_in: expiresIn,
    },
  })
}

/**
 * 인터셉터로 등록된 request handler를 실행하여 토큰 주입을 시뮬레이션.
 * getAccessToken은 private이므로, 인터셉터 콜백을 통해 간접 호출한다.
 */
async function triggerRequestInterceptor(): Promise<void> {
  const requestUse = mockAxiosInstance.interceptors.request.use
  if (requestUse.mock.calls.length > 0) {
    const handler = requestUse.mock.calls[requestUse.mock.calls.length - 1][0]
    await handler({ headers: {} })
  }
}

// =============================================
// 테스트
// =============================================

describe('NaverCommerceApiClient', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // 1. Constructor creates axios instance with baseURL
  describe('constructor', () => {
    it('axios.create를 baseURL과 함께 호출한다', () => {
      const axios = require('axios')
      createClient()

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://api.commerce.naver.com',
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000,
        }),
      )
    })
  })

  // 2. generateSignature creates valid bcrypt signature
  describe('generateSignature', () => {
    it('bcrypt 기반 전자서명을 생성한다', async () => {
      const client = createClient()
      mockTokenResponse()

      // 인터셉터를 통해 getAccessToken 호출 → 내부적으로 generateSignature 호출
      await triggerRequestInterceptor()

      // axios.post가 호출될 때 client_secret_sign 파라미터 검증
      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://api.commerce.naver.com/external/v1/oauth2/token',
        null,
        expect.objectContaining({
          params: expect.objectContaining({
            client_secret_sign: expect.any(String),
          }),
        }),
      )

      // bcrypt 해시 → base64 인코딩 결과 검증
      const callArgs = mockAxiosPost.mock.calls[0][2]
      const timestamp = callArgs.params.timestamp
      const signature = callArgs.params.client_secret_sign

      const expectedHash = `bcrypt_hashed_test-client-id_${timestamp}`
      const expected = Buffer.from(expectedHash, 'utf-8').toString('base64')

      expect(signature).toBe(expected)
    })
  })

  // 3. getAccessToken fetches new token
  describe('getAccessToken', () => {
    it('새 토큰을 발급받는다', async () => {
      const client = createClient()
      mockTokenResponse()

      await triggerRequestInterceptor()

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://api.commerce.naver.com/external/v1/oauth2/token',
        null,
        expect.objectContaining({
          params: expect.objectContaining({
            grant_type: 'client_credentials',
            client_id: 'test-client-id',
            type: 'SELF',
          }),
        }),
      )
    })

    // 4. getAccessToken returns cached token within 5min buffer
    it('만료 5분 전까지 캐시된 토큰을 반환한다', async () => {
      const client = createClient()

      // 첫 번째 호출: 토큰 발급 (6시간 유효)
      mockTokenResponse(21600)
      await triggerRequestInterceptor()
      expect(mockAxiosPost).toHaveBeenCalledTimes(1)

      // 두 번째 호출: 캐시 반환 (재발급 없음)
      await triggerRequestInterceptor()
      expect(mockAxiosPost).toHaveBeenCalledTimes(1)
    })
  })

  // 5. registerProduct calls POST /external/v2/products
  describe('registerProduct', () => {
    it('POST /external/v2/products를 호출한다', async () => {
      const client = createClient()
      const productData = {
        name: '테스트 상품',
        statusType: 'SALE' as const,
        saleType: 'NEW' as const,
        leafCategoryId: '50000001',
        salePrice: 10000,
        stockQuantity: 100,
        deliveryInfo: {
          deliveryType: 'DELIVERY',
          deliveryAttributeType: 'NORMAL',
        },
      }

      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { originProductNo: 12345, smartstoreChannelProductNo: 67890 },
      })

      const result = await client.registerProduct(productData)

      // v2 API는 originProduct 구조로 래핑하여 호출
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/external/v2/products',
        expect.objectContaining({
          originProduct: expect.objectContaining({
            statusType: 'SALE',
            saleType: 'NEW',
            leafCategoryId: '50000001',
          }),
          smartstoreChannelProduct: expect.objectContaining({
            channelProductName: '테스트 상품',
          }),
        }),
      )
      expect(result).toEqual({
        originProductNo: 12345,
        smartstoreChannelProductNo: 67890,
      })
    })
  })

  // 6. updateProduct calls PUT with correct URL
  describe('updateProduct', () => {
    it('PUT /external/v2/products/{id}를 호출한다', async () => {
      const client = createClient()
      const updateData = { name: '수정된 상품명' }

      mockAxiosInstance.put.mockResolvedValueOnce({ data: {} })

      await client.updateProduct(12345, updateData)

      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        '/external/v2/products/12345',
        { ...updateData, originProductNo: 12345 },
      )
    })
  })

  // 7. updatePrice calls PATCH with salePrice
  describe('updatePrice', () => {
    it('PATCH /external/v2/products/{id}/price를 salePrice와 함께 호출한다', async () => {
      const client = createClient()

      mockAxiosInstance.patch.mockResolvedValueOnce({ data: {} })

      await client.updatePrice({ originProductNo: 12345, salePrice: 15000 })

      expect(mockAxiosInstance.patch).toHaveBeenCalledWith(
        '/external/v2/products/12345/price',
        { salePrice: 15000 },
      )
    })
  })

  // 8. suspendProduct calls PUT status/SUSPENSION
  describe('suspendProduct', () => {
    it('PUT /external/v2/products/{id}/status/SUSPENSION을 호출한다', async () => {
      const client = createClient()

      mockAxiosInstance.put.mockResolvedValueOnce({ data: {} })

      await client.suspendProduct(12345)

      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        '/external/v2/products/12345/status/SUSPENSION',
      )
    })
  })

  // 9. getOrders passes default params (POST last-changed-statuses)
  describe('getOrders', () => {
    it('기본 파라미터로 주문 목록을 조회한다', async () => {
      const client = createClient()

      // last-changed-statuses 응답: 빈 목록 → 바로 빈 결과 반환
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { data: { lastChangeStatuses: [] } },
      })

      const result = await client.getOrders()

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/external/v1/pay-order/seller/product-orders/last-changed-statuses',
        expect.objectContaining({
          lastChangedStatuses: ['PAY_DONE', 'DELIVERING', 'DELIVERED'],
        }),
      )
      expect(result).toEqual({ data: [], total: 0, page: 1, size: 0 })
    })
  })

  // 10. getNewOrders filters PAY_DONE only
  describe('getNewOrders', () => {
    it('PAY_DONE 상태만 필터링하여 조회한다', async () => {
      const client = createClient()

      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { data: { lastChangeStatuses: [] } },
      })

      await client.getNewOrders()

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/external/v1/pay-order/seller/product-orders/last-changed-statuses',
        expect.objectContaining({
          lastChangedStatuses: ['PAY_DONE'],
        }),
      )
    })
  })

  // 11. healthCheck returns true on success
  describe('healthCheck', () => {
    it('토큰 발급 성공 시 true를 반환한다', async () => {
      const client = createClient()
      mockTokenResponse()

      const result = await client.healthCheck()

      expect(result).toBe(true)
    })

    // 12. healthCheck returns false on failure
    it('토큰 발급 실패 시 false를 반환한다', async () => {
      const client = createClient()
      mockAxiosPost.mockRejectedValueOnce(new Error('Network error'))

      const result = await client.healthCheck()

      expect(result).toBe(false)
    })
  })
})
