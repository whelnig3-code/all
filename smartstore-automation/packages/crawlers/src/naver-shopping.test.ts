// =============================================
// NaverShoppingCrawler.close() 단위 테스트
// =============================================

import { NaverShoppingCrawler } from './naver-shopping'
import type { Browser, Page } from 'playwright'

// Playwright 모킹
jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn(),
  },
}))

// BaseCrawler 모킹 (robots.txt 체크 bypass)
jest.mock('./base-crawler', () => ({
  BaseCrawler: class {
    protected async checkRobotsTxt(): Promise<void> {}
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

/** 브라우저/페이지 mock 팩토리 */
function makeMockBrowser(pageOverrides: Partial<Page> = {}): {
  browser: Browser & { close: jest.Mock }
  page: Page & { close: jest.Mock }
} {
  const page = {
    setExtraHTTPHeaders: jest.fn().mockResolvedValue(undefined),
    goto: jest.fn().mockResolvedValue(undefined),
    waitForSelector: jest.fn().mockRejectedValue(new Error('no selector')),
    evaluate: jest.fn().mockResolvedValue([]),
    close: jest.fn().mockResolvedValue(undefined),
    ...pageOverrides,
  } as unknown as Page & { close: jest.Mock }

  const browser = {
    newPage: jest.fn().mockResolvedValue(page),
    close: jest.fn().mockResolvedValue(undefined),
  } as unknown as Browser & { close: jest.Mock }

  return { browser, page }
}

describe('NaverShoppingCrawler.close()', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('브라우저 미초기화 상태에서 close() → 오류 없음', async () => {
    const crawler = new NaverShoppingCrawler()

    await expect(crawler.close()).resolves.toBeUndefined()
  })

  it('중복 close() 호출 안전 (idempotent)', async () => {
    const crawler = new NaverShoppingCrawler()

    // 두 번 연속 호출 — 모두 안전
    await expect(crawler.close()).resolves.toBeUndefined()
    await expect(crawler.close()).resolves.toBeUndefined()
  })

  it('브라우저 초기화 후 close() → browser.close() 정확히 1회 호출', async () => {
    const { browser } = makeMockBrowser()
    chromium.launch.mockResolvedValue(browser)

    const crawler = new NaverShoppingCrawler()

    // fetchCompetitorPrices 호출 → 브라우저 초기화됨
    await crawler.fetchCompetitorPrices('테스트 상품')
    expect(chromium.launch).toHaveBeenCalledTimes(1)

    // close() 호출
    await crawler.close()
    expect(browser.close).toHaveBeenCalledTimes(1)
  })

  it('close() 이후 추가 close() → browser.close() 재호출 없음', async () => {
    const { browser } = makeMockBrowser()
    chromium.launch.mockResolvedValue(browser)

    const crawler = new NaverShoppingCrawler()
    await crawler.fetchCompetitorPrices('테스트 상품')

    // 첫 번째 close
    await crawler.close()
    expect(browser.close).toHaveBeenCalledTimes(1)

    // 두 번째 close — browser가 null이므로 추가 호출 없음
    await crawler.close()
    expect(browser.close).toHaveBeenCalledTimes(1) // 여전히 1회
  })

  it('fetchCompetitorPrices 실패 후에도 page.close() 호출 (finally 보장)', async () => {
    const { browser, page } = makeMockBrowser({
      goto: jest.fn().mockRejectedValue(new Error('navigation failed')),
    })
    chromium.launch.mockResolvedValue(browser)

    const crawler = new NaverShoppingCrawler()
    const result = await crawler.fetchCompetitorPrices('오류 상품')

    // 오류 시 빈 배열 반환
    expect(result).toEqual([])
    // 페이지는 반드시 닫혀야 함
    expect(page.close).toHaveBeenCalledTimes(1)
  })
})

// =============================================
// fetchTop20Products 단위 테스트
// =============================================

describe('NaverShoppingCrawler.fetchTop20Products', () => {
  /** 정상 evaluate 반환값 */
  const TOP20_OK = {
    adCount: 3,
    avgReview: 120,
    brandCountTop10: 2,
    avgTopPrice: 25000,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('evaluate 결과를 Top20ProductsResult로 반환', async () => {
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

  it('page.evaluate 오류 → fail-safe 기본값 반환', async () => {
    const { browser } = makeMockBrowser({
      evaluate: jest.fn().mockRejectedValue(new Error('evaluate 실패')),
    })
    chromium.launch.mockResolvedValue(browser)

    const crawler = new NaverShoppingCrawler({ minDelayMs: 0, maxDelayMs: 0 })
    const result = await crawler.fetchTop20Products('오류 키워드')

    // 크롤링 실패 시 fail-safe → 노출 점수가 높게 계산되어 등록 허용 방향
    expect(result).toEqual({ adCount: 0, avgReview: 0, brandCountTop10: 0, avgTopPrice: 0 })
  })

  it('page.goto 오류 → fail-safe 반환 + page.close() 호출', async () => {
    const { browser, page } = makeMockBrowser({
      goto: jest.fn().mockRejectedValue(new Error('네트워크 오류')),
    })
    chromium.launch.mockResolvedValue(browser)

    const crawler = new NaverShoppingCrawler({ minDelayMs: 0, maxDelayMs: 0 })
    const result = await crawler.fetchTop20Products('공구')

    expect(result).toEqual({ adCount: 0, avgReview: 0, brandCountTop10: 0, avgTopPrice: 0 })
    // 오류 발생 시에도 페이지 닫힘 (finally)
    expect(page.close).toHaveBeenCalledTimes(1)
  })

  it('avgTopPrice = 0 → 데이터 없음 처리 (가격 미노출 상품)', async () => {
    const { browser } = makeMockBrowser({
      evaluate: jest.fn().mockResolvedValue({ adCount: 2, avgReview: 50, brandCountTop10: 1, avgTopPrice: 0 }),
    })
    chromium.launch.mockResolvedValue(browser)

    const crawler = new NaverShoppingCrawler({ minDelayMs: 0, maxDelayMs: 0 })
    const result = await crawler.fetchTop20Products('특수 공구')

    expect(result.avgTopPrice).toBe(0) // 0이면 노출 점수 계산 시 중립 처리
  })
})
