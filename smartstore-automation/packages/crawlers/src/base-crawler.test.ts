// =============================================
// BaseCrawler.checkRobotsTxt 단위 테스트
// global.fetch를 모킹하여 네트워크 없이 검증
// =============================================

import { BaseCrawler, type CrawledProduct, type CrawlOptions } from './base-crawler'

/** 테스트용 구체 크롤러 (추상 클래스 인스턴스화) */
class TestCrawler extends BaseCrawler {
  async runCheck(baseUrl: string, path?: string): Promise<void> {
    return this.checkRobotsTxt(baseUrl, path)
  }

  /** buildProductUniqueKey — protected 메서드를 테스트에서 접근 가능하도록 노출 */
  runBuildUniqueKey(source: string, sourceProductId: string): string {
    return this.buildProductUniqueKey(source, sourceProductId)
  }

  /** filterByCategory — protected 메서드를 테스트에서 접근 가능하도록 노출 */
  runFilterByCategory(products: CrawledProduct[], options?: CrawlOptions): CrawledProduct[] {
    return this.filterByCategory(products, options)
  }
}

/** fetch mock 헬퍼 */
function mockFetch(status: number, body: string): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
  } as Response)
}

describe('BaseCrawler.checkRobotsTxt', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('robots.txt 없음(404) → 허용', async () => {
    mockFetch(404, '')
    const crawler = new TestCrawler()
    await expect(crawler.runCheck('https://example.com', '/')).resolves.toBeUndefined()
  })

  it('Disallow: / → 차단 (에러 throw)', async () => {
    mockFetch(200, 'User-agent: *\nDisallow: /')
    const crawler = new TestCrawler()
    await expect(crawler.runCheck('https://example.com', '/')).rejects.toThrow('robots.txt')
  })

  it('Disallow: /, Allow: /search → /search 경로 허용', async () => {
    mockFetch(200, 'User-agent: *\nDisallow: /\nAllow: /search')
    const crawler = new TestCrawler()
    await expect(crawler.runCheck('https://example.com', '/search')).resolves.toBeUndefined()
  })

  it('네이버 쇼핑 전형 robots.txt — /search/all 허용', async () => {
    const robotsTxt = [
      'User-agent: *',
      'Disallow: /login',
      'Disallow: /my',
      'Allow: /search/all',
    ].join('\n')
    mockFetch(200, robotsTxt)
    const crawler = new TestCrawler()
    await expect(
      crawler.runCheck('https://search.shopping.naver.com', '/search/all'),
    ).resolves.toBeUndefined()
  })

  it('네트워크 오류 → 페일-오픈 (허용)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network error'))
    const crawler = new TestCrawler()
    await expect(crawler.runCheck('https://example.com', '/')).resolves.toBeUndefined()
  })

  it('캐시 동작 — fetch는 1회만 호출', async () => {
    mockFetch(200, 'User-agent: *\nAllow: /')
    const crawler = new TestCrawler()
    await crawler.runCheck('https://example.com', '/')
    await crawler.runCheck('https://example.com', '/')
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
})

// ---- buildProductUniqueKey ----

describe('BaseCrawler.buildProductUniqueKey', () => {
  it('"{source}:{sourceProductId}" 포맷 반환', () => {
    const crawler = new TestCrawler()
    expect(crawler.runBuildUniqueKey('domaegguk', '123456')).toBe('domaegguk:123456')
  })

  it('오너클랜 소스도 동일 포맷 반환', () => {
    const crawler = new TestCrawler()
    expect(crawler.runBuildUniqueKey('ownerclan', 'PROD-789')).toBe('ownerclan:PROD-789')
  })

  it('소스와 ID 사이 콜론(:)이 정확히 1개', () => {
    const crawler = new TestCrawler()
    const key = crawler.runBuildUniqueKey('domaegguk', 'ABC')
    const parts = key.split(':')
    expect(parts).toHaveLength(2)
    expect(parts[0]).toBe('domaegguk')
    expect(parts[1]).toBe('ABC')
  })
})

// =============================================
// 카테고리 필터 테스트
// =============================================

describe('BaseCrawler.filterByCategory', () => {
  const mockProducts: CrawledProduct[] = [
    { name: '패션 셔츠', category: '패션의류', sourceProductId: '1' },
    { name: '전자렌지', category: '디지털/가전', sourceProductId: '2' },
    { name: '비타민', category: '식품', sourceProductId: '3' },
    { name: '축구공', category: '스포츠/레저', sourceProductId: '4' },
    { name: '소설책', category: '도서/음반', sourceProductId: '5' },
  ]

  it('allowedCategories 지정 시 해당 카테고리만 통과', () => {
    const crawler = new TestCrawler()
    const result = crawler.runFilterByCategory(mockProducts, {
      allowedCategories: ['패션의류', '식품'],
    })
    expect(result).toHaveLength(2)
    expect(result.map(p => p.name)).toEqual(['패션 셔츠', '비타민'])
  })

  it('allowedCategories 미지정 시 전체 통과', () => {
    const crawler = new TestCrawler()
    const result = crawler.runFilterByCategory(mockProducts, {})
    expect(result).toHaveLength(5)
  })

  it('options 자체가 undefined면 전체 통과', () => {
    const crawler = new TestCrawler()
    const result = crawler.runFilterByCategory(mockProducts)
    expect(result).toHaveLength(5)
  })

  it('빈 allowedCategories 배열 → 전체 차단', () => {
    const crawler = new TestCrawler()
    const result = crawler.runFilterByCategory(mockProducts, {
      allowedCategories: [],
    })
    expect(result).toHaveLength(0)
  })

  it('부분 매칭 지원 (includes)', () => {
    const crawler = new TestCrawler()
    const products: CrawledProduct[] = [
      { name: '건강기능식품 비타민', category: '건강기능식품/비타민', sourceProductId: '10' },
      { name: '일반 식품', category: '식품', sourceProductId: '11' },
    ]
    const result = crawler.runFilterByCategory(products, {
      allowedCategories: ['식품'],
    })
    // '식품'이 '건강기능식품/비타민'에 포함되므로 둘 다 통과
    expect(result).toHaveLength(2)
  })

  it('원본 배열은 변경하지 않음 (불변성)', () => {
    const crawler = new TestCrawler()
    const original = [...mockProducts]
    crawler.runFilterByCategory(mockProducts, {
      allowedCategories: ['패션의류'],
    })
    expect(mockProducts).toEqual(original)
  })
})
