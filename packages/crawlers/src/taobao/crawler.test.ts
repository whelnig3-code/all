// =============================================
// 타오바오 크롤러 테스트
//
// TDD RED → GREEN → REFACTOR
// =============================================

import { TaobaoCrawler } from './crawler'
import type { TaobaoProduct } from './types'

// ---- Mocks ----

jest.mock('@smartstore/shared', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}))

// Playwright mock objects — created fresh in beforeEach
let mockPage: Record<string, jest.Mock>
let mockContext: Record<string, jest.Mock>
let mockBrowser: Record<string, jest.Mock>

jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn(),
  },
}))

// We need to grab the reference after jest.mock hoisting
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { chromium } = require('playwright') as {
  chromium: { launch: jest.Mock }
}

// Mock fetch for robots.txt
const mockFetch = jest.fn()
global.fetch = mockFetch as unknown as typeof fetch

// ---- Helpers ----

function makeProducts(
  overrides: Array<Partial<TaobaoProduct>>,
): TaobaoProduct[] {
  return overrides.map((o, i) => ({
    sourceProductId: `tb-${i}`,
    name: `타오바오 상품 ${i}`,
    category: '기타',
    overseasPrice: 100,
    currency: 'CNY' as const,
    shippingFee: 10,
    imageUrl: 'https://img.alicdn.com/img.jpg',
    detailUrl: `https://item.taobao.com/item.htm?id=tb-${i}`,
    monthlySales: 500,
    storeName: '테스트 매장',
    storeRating: 4.8,
    ...o,
  }))
}

// ---- Tests ----

describe('TaobaoCrawler', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    process.env = { ...originalEnv, SOURCING_TAOBAO_ENABLED: 'true' }

    // Fresh mock objects each test
    mockPage = {
      goto: jest.fn().mockResolvedValue(undefined),
      $$eval: jest.fn().mockResolvedValue([]),
      evaluate: jest.fn().mockResolvedValue(undefined),
      setViewportSize: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    }

    mockContext = {
      addCookies: jest.fn().mockResolvedValue(undefined),
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn().mockResolvedValue(undefined),
    }

    mockBrowser = {
      newContext: jest.fn().mockResolvedValue(mockContext),
      close: jest.fn().mockResolvedValue(undefined),
    }

    chromium.launch.mockResolvedValue(mockBrowser)

    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('User-agent: *\nAllow: /'),
    })
  })

  afterEach(() => {
    jest.useRealTimers()
    process.env = originalEnv
  })

  // ---- 1. Constructor defaults ----

  it('기본 옵션으로 생성 시 적절한 기본값 설정', () => {
    const crawler = new TaobaoCrawler({
      cookieString: 'session=abc',
    })

    expect(crawler.headless).toBe(true)
    expect(crawler.minDelayMs).toBe(4000)
    expect(crawler.maxDelayMs).toBe(8000)
    expect(crawler.maxPages).toBe(3)
  })

  it('사용자 옵션으로 기본값 오버라이드', () => {
    const crawler = new TaobaoCrawler({
      headless: false,
      minDelayMs: 5000,
      maxDelayMs: 10000,
      maxPages: 5,
      cookieString: 'session=abc',
    })

    expect(crawler.headless).toBe(false)
    expect(crawler.minDelayMs).toBe(5000)
    expect(crawler.maxDelayMs).toBe(10000)
    expect(crawler.maxPages).toBe(5)
  })

  // ---- 2. buildUniqueKey ----

  it('buildUniqueKey가 "taobao:{id}" 형식 반환', () => {
    const crawler = new TaobaoCrawler({ cookieString: 'session=abc' })

    expect(crawler.buildUniqueKey('12345')).toBe('taobao:12345')
    expect(crawler.buildUniqueKey('99999')).toBe('taobao:99999')
  })

  // ---- 3. Environment flag ----

  it('SOURCING_TAOBAO_ENABLED가 비활성이면 에러 throw', async () => {
    process.env.SOURCING_TAOBAO_ENABLED = 'false'
    const crawler = new TaobaoCrawler({ cookieString: 'session=abc' })

    await expect(crawler.crawlSearch('가방')).rejects.toThrow(
      'SOURCING_TAOBAO_ENABLED',
    )
  })

  it('SOURCING_TAOBAO_ENABLED가 없으면 에러 throw', async () => {
    delete process.env.SOURCING_TAOBAO_ENABLED
    const crawler = new TaobaoCrawler({ cookieString: 'session=abc' })

    await expect(crawler.crawlSearch('가방')).rejects.toThrow(
      'SOURCING_TAOBAO_ENABLED',
    )
  })

  // ---- 4. Missing cookie ----

  it('cookieString 없으면 에러 throw', async () => {
    const crawler = new TaobaoCrawler()

    await expect(crawler.crawlSearch('가방')).rejects.toThrow(
      '타오바오 크롤링에는 로그인 쿠키가 필요합니다',
    )
  })

  // ---- 5. robots.txt check ----

  it('크롤링 전 robots.txt 확인 호출', async () => {
    const crawler = new TaobaoCrawler({ cookieString: 'session=abc' })

    const promise = crawler.crawlSearch('가방')
    // Advance timers to resolve randomDelay calls
    await jest.advanceTimersByTimeAsync(10000)
    await promise

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('robots.txt'),
      expect.any(Object),
    )
  })

  // ---- 6. Random delay ----

  it('랜덤 지연이 4~8초 범위 내', () => {
    const crawler = new TaobaoCrawler({ cookieString: 'session=abc' })

    const delays: number[] = []
    const origRandom = Math.random
    const testValues = [0, 0.25, 0.5, 0.75, 1 - Number.EPSILON]
    for (const val of testValues) {
      Math.random = () => val
      const delay = crawler.calculateDelay()
      delays.push(delay)
    }
    Math.random = origRandom

    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(4000)
      expect(delay).toBeLessThanOrEqual(8000)
    }
  })

  // ---- 7. Cookie parsing and injection ----

  it('쿠키 문자열을 파싱하여 브라우저 컨텍스트에 주입', async () => {
    const cookieString = 'session=abc123; user=test; lang=zh-CN'
    const crawler = new TaobaoCrawler({ cookieString })

    const promise = crawler.crawlSearch('가방')
    await jest.advanceTimersByTimeAsync(10000)
    await promise
    await crawler.close()

    expect(mockContext.addCookies).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: 'session', value: 'abc123' }),
        expect.objectContaining({ name: 'user', value: 'test' }),
        expect.objectContaining({ name: 'lang', value: 'zh-CN' }),
      ]),
    )
  })

  // ---- 8. minMonthlySales filter ----

  it('minMonthlySales 미만 상품은 필터링', () => {
    const crawler = new TaobaoCrawler({
      cookieString: 'session=abc',
      minMonthlySales: 100,
    })

    const products = makeProducts([
      { monthlySales: 50 },
      { monthlySales: 100 },
      { monthlySales: 200 },
      { monthlySales: 10 },
    ])

    const result = crawler.filterByMonthlySales(products)

    expect(result).toHaveLength(2)
    expect(result.map(p => p.monthlySales)).toEqual([100, 200])
  })

  it('minMonthlySales 미설정 시 전체 반환', () => {
    const crawler = new TaobaoCrawler({ cookieString: 'session=abc' })

    const products = makeProducts([
      { monthlySales: 1 },
      { monthlySales: 0 },
    ])

    const result = crawler.filterByMonthlySales(products)
    expect(result).toHaveLength(2)
  })

  // ---- 9. Category filter via BaseCrawler ----

  it('카테고리 필터 — BaseCrawler의 filterByCategory 활용', () => {
    const crawler = new TaobaoCrawler({ cookieString: 'session=abc' })

    const products = makeProducts([
      { category: '여성의류' },
      { category: '전자제품' },
      { category: '여성가방' },
    ])

    const result = crawler.filterProducts(products, {
      allowedCategories: ['여성'],
    })

    expect(result).toHaveLength(2)
    expect(result.map(p => p.category)).toEqual(['여성의류', '여성가방'])
  })

  // ---- 10. Viewport randomization ----

  it('뷰포트 크기가 지정 범위 내 (1200-1600 x 800-1000)', () => {
    const crawler = new TaobaoCrawler({ cookieString: 'session=abc' })

    const origRandom = Math.random
    const viewports: Array<{ width: number; height: number }> = []

    for (const val of [0, 0.5, 1 - Number.EPSILON]) {
      Math.random = () => val
      viewports.push(crawler.generateViewport())
    }
    Math.random = origRandom

    for (const vp of viewports) {
      expect(vp.width).toBeGreaterThanOrEqual(1200)
      expect(vp.width).toBeLessThanOrEqual(1600)
      expect(vp.height).toBeGreaterThanOrEqual(800)
      expect(vp.height).toBeLessThanOrEqual(1000)
    }
  })

  // ---- 11. Close releases browser ----

  it('close 호출 시 브라우저 리소스 해제', async () => {
    const crawler = new TaobaoCrawler({ cookieString: 'session=abc' })

    // Trigger browser launch
    const promise = crawler.crawlSearch('가방')
    await jest.advanceTimersByTimeAsync(10000)
    await promise

    await crawler.close()

    expect(mockBrowser.close).toHaveBeenCalled()
  })

  // ---- 12. Empty search ----

  it('검색 결과 없으면 빈 배열 반환', async () => {
    mockPage.$$eval.mockResolvedValue([])

    const crawler = new TaobaoCrawler({ cookieString: 'session=abc' })

    const promise = crawler.crawlSearch('존재하지않는상품xyz')
    await jest.advanceTimersByTimeAsync(10000)
    const result = await promise
    await crawler.close()

    expect(result).toEqual([])
  })
})
