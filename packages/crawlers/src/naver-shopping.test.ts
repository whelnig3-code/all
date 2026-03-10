// =============================================
// NaverShoppingCrawler 단위 테스트
//
// 변경된 크롤러 구조:
//   - ensureBrowser() → BrowserContext 반환
//   - Playwright 0건 시 네이버 검색 API fallback
//   - 다중 셀렉터 waitForAnySelector
// =============================================

import { NaverShoppingCrawler } from './naver-shopping'

// Playwright 모킹
jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn(),
  },
}))

// BaseCrawler 모킹 (robots.txt 체크 bypass)
jest.mock('./base-crawler', () => ({
  BaseCrawler: class {
    protected async checkRobotsTxt() {}
  },
}))

// 로거 모킹
jest.mock('@smartstore/shared', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}))

const { chromium } = jest.requireMock('playwright') as {
  chromium: { launch: jest.Mock }
}

// global.fetch 모킹 (API fallback 테스트용)
const mockFetch = jest.fn() as jest.Mock
global.fetch = mockFetch

/**
 * locator mock 생성 — waitForAnySelector에서 page.locator(sel).count() 호출
 * @param matchCount 매칭 건수 (0이면 셀렉터 미매칭)
 */
function makeLocatorMock(matchCount: number) {
  return jest.fn().mockReturnValue({
    count: jest.fn().mockResolvedValue(matchCount),
  })
}

/**
 * 브라우저 + 컨텍스트 + 페이지 mock 팩토리
 * 새 구조: browser.newContext() → context.newPage() → page
 */
function makeMockBrowser(pageOverrides: Record<string, unknown> = {}, locatorCount = 3) {
  const page = {
    goto: jest.fn().mockResolvedValue(undefined),
    waitForSelector: jest.fn().mockResolvedValue(undefined),
    locator: makeLocatorMock(locatorCount),
    evaluate: jest.fn().mockResolvedValue([]),
    close: jest.fn().mockResolvedValue(undefined),
    ...pageOverrides,
  }

  const context = {
    newPage: jest.fn().mockResolvedValue(page),
    addInitScript: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  }

  const browser = {
    newContext: jest.fn().mockResolvedValue(context),
    close: jest.fn().mockResolvedValue(undefined),
  }

  return { browser, context, page }
}

describe('NaverShoppingCrawler.close()', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockReset()
  })

  it('브라우저 미초기화 상태에서 close() — 오류 없음', async () => {
    const crawler = new NaverShoppingCrawler()
    await expect(crawler.close()).resolves.toBeUndefined()
  })

  it('중복 close() 호출 안전 (idempotent)', async () => {
    const crawler = new NaverShoppingCrawler()
    await expect(crawler.close()).resolves.toBeUndefined()
    await expect(crawler.close()).resolves.toBeUndefined()
  })

  it('브라우저 초기화 후 close() — browser.close() 정확히 1회 호출', async () => {
    const { browser } = makeMockBrowser()
    chromium.launch.mockResolvedValue(browser)

    const crawler = new NaverShoppingCrawler({ minDelayMs: 0, maxDelayMs: 0 })
    // fetchCompetitorPrices 호출 → 브라우저 초기화됨
    // Playwright 0건 반환 시 API fallback → fetch mock 필요
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
    })
    await crawler.fetchCompetitorPrices('테스트 상품')
    expect(chromium.launch).toHaveBeenCalledTimes(1)

    await crawler.close()
    expect(browser.close).toHaveBeenCalledTimes(1)
  })

  it('close() 이후 추가 close() — browser.close() 재호출 없음', async () => {
    const { browser } = makeMockBrowser()
    chromium.launch.mockResolvedValue(browser)
    mockFetch.mockResolvedValue({ ok: false, status: 403 })

    const crawler = new NaverShoppingCrawler({ minDelayMs: 0, maxDelayMs: 0 })
    await crawler.fetchCompetitorPrices('테스트 상품')

    await crawler.close()
    expect(browser.close).toHaveBeenCalledTimes(1)

    await crawler.close()
    expect(browser.close).toHaveBeenCalledTimes(1) // 여전히 1회
  })

  it('fetchCompetitorPrices Playwright 실패 후에도 page.close() 호출 (finally 보장)', async () => {
    const { browser, page } = makeMockBrowser({
      goto: jest.fn().mockRejectedValue(new Error('navigation failed')),
    })
    chromium.launch.mockResolvedValue(browser)
    mockFetch.mockResolvedValue({ ok: false, status: 403 })

    const crawler = new NaverShoppingCrawler({ minDelayMs: 0, maxDelayMs: 0 })
    const result = await crawler.fetchCompetitorPrices('오류 상품')

    // Playwright 실패 → API fallback도 실패 → 빈 배열
    expect(result).toEqual([])
    expect(page.close).toHaveBeenCalledTimes(1)
  })
})

// =============================================
// fetchCompetitorPrices — Playwright 성공 케이스
// =============================================

describe('NaverShoppingCrawler.fetchCompetitorPrices (Playwright)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockReset()
  })

  it('Playwright에서 상품 추출 성공 시 API fallback 미호출', async () => {
    const mockResults = [
      { sellerName: 'A스토어', price: 5000 },
      { sellerName: 'B스토어', price: 6000 },
    ]
    const { browser } = makeMockBrowser({
      evaluate: jest.fn().mockResolvedValue(mockResults),
    })
    chromium.launch.mockResolvedValue(browser)

    const crawler = new NaverShoppingCrawler({ minDelayMs: 0, maxDelayMs: 0 })
    const result = await crawler.fetchCompetitorPrices('USB 충전기', 3)

    expect(result).toEqual([
      { sellerName: 'A스토어', price: 5000, rank: 1 },
      { sellerName: 'B스토어', price: 6000, rank: 2 },
    ])
    // API fallback은 호출되지 않아야 함
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

// =============================================
// fetchCompetitorPrices — API fallback 케이스
// =============================================

describe('NaverShoppingCrawler.fetchCompetitorPrices (API fallback)', () => {
  const origEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockReset()
    process.env = {
      ...origEnv,
      NAVER_CLIENT_ID: 'test-id',
      NAVER_CLIENT_SECRET: 'test-secret',
    }
  })

  afterEach(() => {
    process.env = origEnv
  })

  it('Playwright 0건 → API fallback으로 결과 반환', async () => {
    // Playwright: 셀렉터 매칭되지만 evaluate에서 빈 배열
    const { browser } = makeMockBrowser({
      evaluate: jest.fn().mockResolvedValue([]),
    })
    chromium.launch.mockResolvedValue(browser)

    // API fallback: 성공
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        items: [
          { title: 'USB 충전기', lprice: '3000', mallName: '네이버' },
          { title: 'USB 충전기 2포트', lprice: '5000', mallName: '쿠팡' },
        ],
      }),
    })

    const crawler = new NaverShoppingCrawler({ minDelayMs: 0, maxDelayMs: 0 })
    const result = await crawler.fetchCompetitorPrices('USB 충전기', 3)

    expect(result).toEqual([
      { sellerName: '네이버', price: 3000, rank: 1 },
      { sellerName: '쿠팡', price: 5000, rank: 2 },
    ])
  })

  it('API 키 미설정 시 빈 배열 반환', async () => {
    process.env = { ...origEnv } // API 키 없음
    const { browser } = makeMockBrowser({
      evaluate: jest.fn().mockResolvedValue([]),
    })
    chromium.launch.mockResolvedValue(browser)

    const crawler = new NaverShoppingCrawler({ minDelayMs: 0, maxDelayMs: 0 })
    const result = await crawler.fetchCompetitorPrices('USB 충전기')

    expect(result).toEqual([])
  })
})

// =============================================
// fetchTop20Products 단위 테스트
// =============================================

describe('NaverShoppingCrawler.fetchTop20Products', () => {
  const TOP20_OK = {
    adCount: 3,
    avgReview: 120,
    brandCountTop10: 2,
    avgTopPrice: 25000,
  }

  const origEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockReset()
    process.env = {
      ...origEnv,
      NAVER_CLIENT_ID: 'test-id',
      NAVER_CLIENT_SECRET: 'test-secret',
    }
  })

  afterEach(() => {
    process.env = origEnv
  })

  it('Playwright evaluate 결과를 Top20ProductsResult로 반환', async () => {
    const { browser } = makeMockBrowser({
      evaluate: jest.fn().mockResolvedValue(TOP20_OK),
    })
    chromium.launch.mockResolvedValue(browser)

    const crawler = new NaverShoppingCrawler({ minDelayMs: 0, maxDelayMs: 0 })
    const result = await crawler.fetchTop20Products('드라이버 세트')

    expect(result).toEqual(TOP20_OK)
  })

  it('검색 URL에 키워드가 인코딩되어 포함됨', async () => {
    const { browser, page } = makeMockBrowser({
      evaluate: jest.fn().mockResolvedValue(TOP20_OK),
    })
    chromium.launch.mockResolvedValue(browser)

    const crawler = new NaverShoppingCrawler({ minDelayMs: 0, maxDelayMs: 0 })
    await crawler.fetchTop20Products('전동 드릴')

    expect(page.goto).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent('전동 드릴')),
      expect.any(Object),
    )
  })

  it('페이지는 항상 닫힘 (finally 보장)', async () => {
    const { browser, page } = makeMockBrowser({
      evaluate: jest.fn().mockResolvedValue(TOP20_OK),
    })
    chromium.launch.mockResolvedValue(browser)

    const crawler = new NaverShoppingCrawler({ minDelayMs: 0, maxDelayMs: 0 })
    await crawler.fetchTop20Products('드라이버')

    expect(page.close).toHaveBeenCalledTimes(1)
  })

  it('page.evaluate 오류 → API fallback 시도', async () => {
    const { browser } = makeMockBrowser({
      evaluate: jest.fn().mockRejectedValue(new Error('evaluate 실패')),
    })
    chromium.launch.mockResolvedValue(browser)

    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        items: [
          { title: '공구', lprice: '10000', mallName: '스토어', brand: '브랜드A' },
        ],
      }),
    })

    const crawler = new NaverShoppingCrawler({ minDelayMs: 0, maxDelayMs: 0 })
    const result = await crawler.fetchTop20Products('오류 키워드')

    // API fallback 결과 — 광고/리뷰는 0 (API 한계)
    expect(result.avgTopPrice).toBe(10000)
    expect(result.adCount).toBe(0)
  })

  it('page.goto 오류 → fail-safe 반환 + page.close() 호출', async () => {
    const { browser, page } = makeMockBrowser({
      goto: jest.fn().mockRejectedValue(new Error('네트워크 오류')),
    })
    chromium.launch.mockResolvedValue(browser)

    // API fallback도 실패
    mockFetch.mockResolvedValue({ ok: false, status: 500 })

    const crawler = new NaverShoppingCrawler({ minDelayMs: 0, maxDelayMs: 0 })
    const result = await crawler.fetchTop20Products('공구')

    expect(result).toEqual({ adCount: 0, avgReview: 0, brandCountTop10: 0, avgTopPrice: 0 })
    expect(page.close).toHaveBeenCalledTimes(1)
  })

  it('avgTopPrice = 0 → 데이터 없음 처리 (가격 미노출 상품)', async () => {
    const { browser } = makeMockBrowser({
      evaluate: jest.fn().mockResolvedValue({ adCount: 2, avgReview: 50, brandCountTop10: 1, avgTopPrice: 0 }),
    })
    chromium.launch.mockResolvedValue(browser)

    const crawler = new NaverShoppingCrawler({ minDelayMs: 0, maxDelayMs: 0 })
    const result = await crawler.fetchTop20Products('특수 공구')

    expect(result.avgTopPrice).toBe(0)
  })
})
