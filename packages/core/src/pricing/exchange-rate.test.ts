// =============================================
// 환율 서비스 단위 테스트
// =============================================

import {
  createExchangeRateService,
} from './exchange-rate'

// =============================================
// 테스트
// =============================================

describe('ExchangeRateService', () => {
  /** 성공하는 mock fetch 함수 */
  const createMockFetch = (rates = { USD: 1350, CNY: 185 }) => {
    return jest.fn(async (currency) => ({
      currency,
      rate: rates[currency],
      fetchedAt: new Date(),
      source: 'mock-api',
    }))
  }

  // ---- 캐시 TTL 내 조회 ----

  it('getRate returns cached value within TTL', async () => {
    const mockFetch = createMockFetch()
    const service = createExchangeRateService({
      fetchRate: mockFetch,
      ttlMs: 60_000,
    })

    await service.getRate('USD')
    await service.getRate('USD')

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  // ---- TTL 초과 시 갱신 ----

  it('getRate fetches fresh rate after TTL expires', async () => {
    const mockFetch = createMockFetch()
    const service = createExchangeRateService({
      fetchRate: mockFetch,
      ttlMs: 50, // 50ms TTL
    })

    await service.getRate('USD')

    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 60))

    await service.getRate('USD')

    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  // ---- API 실패 시 fallback ----

  it('fallback rate used when API fails', async () => {
    const failingFetch = jest.fn(async () => {
      throw new Error('API down')
    })
    const service = createExchangeRateService({
      fetchRate: failingFetch,
    })

    const result = await service.getRate('USD')

    expect(result.rate).toBe(1300)
    expect(result.source).toBe('fallback')
  })

  it('fallback rate for CNY is 180', async () => {
    const failingFetch = jest.fn(async () => {
      throw new Error('API down')
    })
    const service = createExchangeRateService({
      fetchRate: failingFetch,
    })

    const result = await service.getRate('CNY')

    expect(result.rate).toBe(180)
    expect(result.source).toBe('fallback')
  })

  // ---- invalidateCache ----

  it('invalidateCache clears cache and triggers fresh fetch', async () => {
    const mockFetch = createMockFetch()
    const service = createExchangeRateService({
      fetchRate: mockFetch,
      ttlMs: 60_000,
    })

    await service.getRate('USD')
    service.invalidateCache()
    await service.getRate('USD')

    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  // ---- USD와 CNY 독립 캐시 ----

  it('USD and CNY rates cached independently', async () => {
    const mockFetch = createMockFetch()
    const service = createExchangeRateService({
      fetchRate: mockFetch,
      ttlMs: 60_000,
    })

    await service.getRate('USD')
    await service.getRate('CNY')

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockFetch).toHaveBeenCalledWith('USD')
    expect(mockFetch).toHaveBeenCalledWith('CNY')
  })

  // ---- 동시 요청 시 중복 fetch 방지 ----

  it('concurrent requests do not trigger multiple API calls', async () => {
    const mockFetch = jest.fn(async (currency) => {
      await new Promise((resolve) => setTimeout(resolve, 50))
      return {
        currency,
        rate: 1350,
        fetchedAt: new Date(),
        source: 'mock-api',
      }
    })
    const service = createExchangeRateService({
      fetchRate: mockFetch,
      ttlMs: 60_000,
    })

    const [r1, r2, r3] = await Promise.all([
      service.getRate('USD'),
      service.getRate('USD'),
      service.getRate('USD'),
    ])

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(r1.rate).toBe(1350)
    expect(r2.rate).toBe(1350)
    expect(r3.rate).toBe(1350)
  })

  // ---- 불변성: 반환 객체가 새 복사본 ----

  it('returned object is a new copy (immutability)', async () => {
    const mockFetch = createMockFetch()
    const service = createExchangeRateService({
      fetchRate: mockFetch,
      ttlMs: 60_000,
    })

    const r1 = await service.getRate('USD')
    const r2 = await service.getRate('USD')

    expect(r1).toEqual(r2)
    expect(r1).not.toBe(r2) // different object references
  })

  // ---- fetchedAt 타임스탬프 ----

  it('fetchedAt timestamp is a valid Date', async () => {
    const mockFetch = createMockFetch()
    const service = createExchangeRateService({
      fetchRate: mockFetch,
      ttlMs: 60_000,
    })

    const before = new Date()
    const result = await service.getRate('USD')
    const after = new Date()

    expect(result.fetchedAt).toBeInstanceOf(Date)
    expect(result.fetchedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(result.fetchedAt.getTime()).toBeLessThanOrEqual(after.getTime())
  })
})
