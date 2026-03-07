// =============================================
// 환율 API 클라이언트 단위 테스트
// =============================================

// axios mock
jest.mock('axios')
import axios from 'axios'
const mockGet = axios.get as jest.MockedFunction<typeof axios.get>

// @smartstore/shared mock — config getter는 process.env를 런타임에 읽어야
// 하므로 getter로 구현해 테스트별 env 변경이 반영되도록 함
jest.mock('@smartstore/shared', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
  get config() {
    return {
      sourcing: {
        aliexpressEnabled: process.env['SOURCING_ALIEXPRESS_ENABLED'] === 'true',
      },
      exchangeRate: {
        apiKey: process.env['EXCHANGE_RATE_API_KEY'] ?? '',
      },
    }
  },
}))

import { fetchExchangeRate, clearRateCache } from './index'

// =============================================
// 헬퍼
// =============================================

/** ExchangeRate-API 성공 응답 목 */
function mockApiSuccess(krwPerUsd = 1300, cnyPerUsd = 7.2) {
  mockGet.mockResolvedValue({
    data: {
      result: 'success',
      base_code: 'USD',
      conversion_rates: {
        KRW: krwPerUsd,
        CNY: cnyPerUsd,
        JPY: 150.0,
      },
    },
  })
}

// =============================================
// 비활성화 모드 (SOURCING_ALIEXPRESS_ENABLED 없음 또는 false)
// =============================================

describe('fetchExchangeRate — 비활성화 모드', () => {
  beforeEach(() => {
    clearRateCache()
    mockGet.mockReset()
    delete process.env['SOURCING_ALIEXPRESS_ENABLED']
    delete process.env['EXCHANGE_RATE_API_KEY']
  })

  it('SOURCING_ALIEXPRESS_ENABLED 미설정 → 폴백 USD 반환', async () => {
    const rate = await fetchExchangeRate('USD')
    expect(typeof rate).toBe('number')
    expect(rate).toBeGreaterThan(0)
  })

  it('SOURCING_ALIEXPRESS_ENABLED=false → 폴백 USD 반환 (API 호출 없음)', async () => {
    process.env['SOURCING_ALIEXPRESS_ENABLED'] = 'false'
    await fetchExchangeRate('USD')
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('비활성화 모드 CNY → 폴백 반환 (양수)', async () => {
    const rate = await fetchExchangeRate('CNY')
    expect(rate).toBeGreaterThan(0)
  })

  it('비활성화 모드 USD/CNY 폴백값 다름 (통화별 구분)', async () => {
    const usdRate = await fetchExchangeRate('USD')
    const cnyRate = await fetchExchangeRate('CNY')
    expect(usdRate).not.toBe(cnyRate)
  })
})

// =============================================
// 활성화 모드 (SOURCING_ALIEXPRESS_ENABLED=true)
// =============================================

describe('fetchExchangeRate — 활성화 모드', () => {
  beforeEach(() => {
    clearRateCache()
    mockGet.mockReset()
    process.env['SOURCING_ALIEXPRESS_ENABLED'] = 'true'
    process.env['EXCHANGE_RATE_API_KEY'] = 'test-api-key'
  })

  afterEach(() => {
    delete process.env['SOURCING_ALIEXPRESS_ENABLED']
    delete process.env['EXCHANGE_RATE_API_KEY']
  })

  it('API 성공 → USD KRW 환율 반환', async () => {
    mockApiSuccess(1300, 7.2)
    const rate = await fetchExchangeRate('USD')
    expect(rate).toBe(1300)
  })

  it('API 성공 → CNY KRW 환율 교차 계산 반환', async () => {
    mockApiSuccess(1300, 7.2)
    const rate = await fetchExchangeRate('CNY')
    // 1300 / 7.2 ≈ 180.56
    expect(rate).toBeCloseTo(1300 / 7.2, 5)
  })

  it('API 키 없음 + 활성화 → Error throw', async () => {
    delete process.env['EXCHANGE_RATE_API_KEY']
    await expect(fetchExchangeRate('USD')).rejects.toThrow('EXCHANGE_RATE_API_KEY')
  })

  it('API 응답에 KRW 없음 → Error throw', async () => {
    mockGet.mockResolvedValue({
      data: {
        result: 'success',
        conversion_rates: { JPY: 150 }, // KRW 없음
      },
    })
    await expect(fetchExchangeRate('USD')).rejects.toThrow('KRW')
  })

  it('API 응답에 CNY 없음 → Error throw', async () => {
    mockGet.mockResolvedValue({
      data: {
        result: 'success',
        conversion_rates: { KRW: 1300 }, // CNY 없음
      },
    })
    await expect(fetchExchangeRate('CNY')).rejects.toThrow('CNY')
  })

  it('API 네트워크 오류 → Error propagation', async () => {
    mockGet.mockRejectedValue(new Error('Network Error'))
    await expect(fetchExchangeRate('USD')).rejects.toThrow('Network Error')
  })

  it('1시간 내 재요청 → 캐시 사용 (API 1회만 호출)', async () => {
    mockApiSuccess(1300, 7.2)
    await fetchExchangeRate('USD')
    await fetchExchangeRate('USD')
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it('캐시 초기화 후 재요청 → API 재호출', async () => {
    mockApiSuccess(1300, 7.2)
    await fetchExchangeRate('USD')
    clearRateCache()
    await fetchExchangeRate('USD')
    expect(mockGet).toHaveBeenCalledTimes(2)
  })

  it('USD, CNY 별개 캐시 관리', async () => {
    mockApiSuccess(1300, 7.2)
    await fetchExchangeRate('USD')
    await fetchExchangeRate('CNY')
    // 두 통화 모두 같은 API 호출로 처리 (USD 기준 1회)
    expect(mockGet).toHaveBeenCalledTimes(2)
  })
})
