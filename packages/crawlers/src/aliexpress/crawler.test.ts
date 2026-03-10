// =============================================
// AliExpress 크롤러 테스트
// =============================================

import { AliexpressProduct } from './types'

// ---- Mocks ----

jest.mock('@smartstore/shared', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}))

const mockGoto = jest.fn().mockResolvedValue(undefined)
const mockClose = jest.fn().mockResolvedValue(undefined)
const mock$$eval = jest.fn().mockResolvedValue([])
const mockEvaluate = jest.fn().mockResolvedValue(undefined)

const mockPage = {
  goto: mockGoto,
  $$eval: mock$$eval,
  evaluate: mockEvaluate,
  setViewportSize: jest.fn().mockResolvedValue(undefined),
}

const mockContext = {
  newPage: jest.fn().mockResolvedValue(mockPage),
}

const mockBrowser = {
  newContext: jest.fn().mockResolvedValue(mockContext),
  close: mockClose,
}

jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue(mockBrowser),
  },
}))

// Mock global fetch for robots.txt
const mockFetch = jest.fn().mockResolvedValue({
  ok: true,
  text: jest.fn().mockResolvedValue('User-agent: *\nAllow: /'),
})
global.fetch = mockFetch as unknown as typeof fetch

// Import after mocks
import { AliexpressCrawler } from './crawler'

describe('AliexpressCrawler', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv, SOURCING_ALIEXPRESS_ENABLED: 'true' }
    mock$$eval.mockResolvedValue([])
    mockFetch.mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue('User-agent: *\nAllow: /'),
    })
  })

  afterEach(() => {
    process.env = originalEnv
  })

  // ---- 1. Constructor defaults ----

  it('기본 옵션으로 생성 시 defaults 적용', () => {
    const crawler = new AliexpressCrawler()

    expect(crawler.baseUrl).toBe('https://www.aliexpress.com')
    expect(crawler.headless).toBe(true)
    expect(crawler.minDelayMs).toBe(3000)
    expect(crawler.maxDelayMs).toBe(7000)
    expect(crawler.maxPages).toBe(3)
  })

  it('커스텀 옵션이 defaults를 override', () => {
    const crawler = new AliexpressCrawler({
      headless: false,
      minDelayMs: 1000,
      maxDelayMs: 2000,
      maxPages: 5,
      minOrders: 100,
      minRating: 4.0,
    })

    expect(crawler.headless).toBe(false)
    expect(crawler.minDelayMs).toBe(1000)
    expect(crawler.maxDelayMs).toBe(2000)
    expect(crawler.maxPages).toBe(5)
  })

  // ---- 2. buildUniqueKey format ----

  it('buildUniqueKey가 "aliexpress:{id}" 형식 반환', () => {
    const crawler = new AliexpressCrawler()
    expect(crawler.buildUniqueKey('1005006789')).toBe('aliexpress:1005006789')
    expect(crawler.buildUniqueKey('99999')).toBe('aliexpress:99999')
  })

  // ---- 3. Disabled environment flag throws ----

  it('SOURCING_ALIEXPRESS_ENABLED가 없으면 crawlCategory에서 throw', async () => {
    delete process.env.SOURCING_ALIEXPRESS_ENABLED
    const crawler = new AliexpressCrawler()

    await expect(
      crawler.crawlCategory('/category/123.html'),
    ).rejects.toThrow('SOURCING_ALIEXPRESS_ENABLED')
  })

  it('SOURCING_ALIEXPRESS_ENABLED가 "false"이면 throw', async () => {
    process.env.SOURCING_ALIEXPRESS_ENABLED = 'false'
    const crawler = new AliexpressCrawler()

    await expect(
      crawler.crawlCategory('/category/123.html'),
    ).rejects.toThrow('SOURCING_ALIEXPRESS_ENABLED')
  })

  // ---- 4. robots.txt check called before crawling ----

  it('crawlCategory 호출 시 robots.txt 확인이 fetch로 호출됨', async () => {
    const crawler = new AliexpressCrawler({ minDelayMs: 0, maxDelayMs: 0 })

    await crawler.crawlCategory('/category/123.html')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.aliexpress.com/robots.txt',
      expect.objectContaining({
        headers: expect.any(Object),
      }),
    )
  })

  // ---- 5. Random delay within range ----

  it('randomDelay가 minDelayMs ~ maxDelayMs 범위 내', async () => {
    const crawler = new AliexpressCrawler({
      minDelayMs: 100,
      maxDelayMs: 200,
    })

    const start = Date.now()
    await crawler.testRandomDelay()
    const elapsed = Date.now() - start

    // 최소 지연 이상이어야 함 (약간의 오차 허용)
    expect(elapsed).toBeGreaterThanOrEqual(90)
    expect(elapsed).toBeLessThan(300)
  })

  // ---- 6. Product filtering by minOrders ----

  it('minOrders 미만 상품 필터링', () => {
    const crawler = new AliexpressCrawler({ minOrders: 50 })
    const products = makeProducts([
      { orderCount: 100, name: '인기상품' },
      { orderCount: 10, name: '비인기상품' },
      { orderCount: 50, name: '경계상품' },
    ])

    const result = crawler.filterByQuality(products)

    expect(result).toHaveLength(2)
    expect(result.map(p => p.name)).toEqual(['인기상품', '경계상품'])
  })

  // ---- 7. Product filtering by minRating ----

  it('minRating 미만 상품 필터링', () => {
    const crawler = new AliexpressCrawler({ minRating: 4.0 })
    const products = makeProducts([
      { rating: 4.8, name: '고평점' },
      { rating: 3.5, name: '저평점' },
      { rating: 4.0, name: '경계평점' },
    ])

    const result = crawler.filterByQuality(products)

    expect(result).toHaveLength(2)
    expect(result.map(p => p.name)).toEqual(['고평점', '경계평점'])
  })

  it('minOrders + minRating 동시 적용', () => {
    const crawler = new AliexpressCrawler({ minOrders: 50, minRating: 4.0 })
    const products = makeProducts([
      { orderCount: 100, rating: 4.5, name: '둘 다 통과' },
      { orderCount: 100, rating: 3.0, name: '평점 미달' },
      { orderCount: 10, rating: 4.5, name: '주문수 미달' },
      { orderCount: 10, rating: 3.0, name: '둘 다 미달' },
    ])

    const result = crawler.filterByQuality(products)

    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('둘 다 통과')
  })

  // ---- 8. Category filter via BaseCrawler ----

  it('allowedCategories로 카테고리 필터링', () => {
    const crawler = new AliexpressCrawler()
    const products = makeProducts([
      { category: 'Electronics' },
      { category: 'Fashion' },
      { category: 'Electronics/Phone' },
    ])

    const result = crawler.filterProducts(products, {
      allowedCategories: ['Electronics'],
    })

    expect(result).toHaveLength(2)
    expect(result.map(p => p.category)).toEqual(['Electronics', 'Electronics/Phone'])
  })

  // ---- 9. Proxy rotation cycles through list ----

  it('프록시 로테이션이 리스트를 순환', () => {
    const proxyUrls = [
      'http://proxy1:8080',
      'http://proxy2:8080',
      'http://proxy3:8080',
    ]
    const crawler = new AliexpressCrawler({ proxyUrls })

    // getNextProxy 3번 호출하면 순환해야 함
    expect(crawler.getNextProxy()).toBe('http://proxy1:8080')
    expect(crawler.getNextProxy()).toBe('http://proxy2:8080')
    expect(crawler.getNextProxy()).toBe('http://proxy3:8080')
    expect(crawler.getNextProxy()).toBe('http://proxy1:8080') // 순환
  })

  it('프록시 리스트가 없으면 getNextProxy는 undefined', () => {
    const crawler = new AliexpressCrawler()
    expect(crawler.getNextProxy()).toBeUndefined()
  })

  // ---- 10. Close releases browser ----

  it('close 호출 시 브라우저 리소스 해제', async () => {
    const crawler = new AliexpressCrawler({ minDelayMs: 0, maxDelayMs: 0 })

    // 브라우저 초기화를 위해 crawlCategory 호출
    await crawler.crawlCategory('/category/123.html')
    await crawler.close()

    expect(mockClose).toHaveBeenCalled()
  })

  // ---- 11. Empty product list returns empty array ----

  it('빈 상품 목록 반환 시 빈 배열', async () => {
    mock$$eval.mockResolvedValue([])
    const crawler = new AliexpressCrawler({ minDelayMs: 0, maxDelayMs: 0 })

    const result = await crawler.crawlCategory('/category/123.html')

    expect(result).toEqual([])
  })

  // ---- 추가 테스트 ----

  it('filterByQuality 필터 없으면 전체 반환', () => {
    const crawler = new AliexpressCrawler() // minOrders, minRating 없음
    const products = makeProducts([
      { orderCount: 1, rating: 0.5 },
      { orderCount: 1000, rating: 5.0 },
    ])

    const result = crawler.filterByQuality(products)
    expect(result).toHaveLength(2)
  })

  it('uniqueKey 생성 시 원본 데이터 불변', () => {
    const crawler = new AliexpressCrawler()
    const id = '1005006789'
    const key = crawler.buildUniqueKey(id)

    expect(key).toBe('aliexpress:1005006789')
    expect(id).toBe('1005006789')
  })
})

/** 테스트 데이터 헬퍼 */
function makeProducts(
  overrides: Array<Partial<AliexpressProduct>>,
): AliexpressProduct[] {
  return overrides.map((o, i) => ({
    sourceProductId: `prod-${i}`,
    name: `Product ${i}`,
    category: 'General',
    overseasPrice: 9.99,
    currency: 'USD' as const,
    shippingFee: 0,
    imageUrl: 'https://ae01.alicdn.com/img.jpg',
    detailUrl: 'https://www.aliexpress.com/item/12345.html',
    rating: 4.5,
    orderCount: 100,
    storeName: 'Test Store',
    ...o,
  }))
}
