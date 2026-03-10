// =============================================
// AliExpress 크롤러 구현 (Playwright 기반)
//
// 준수 사항 (CLAUDE.md 핵심 경고 #4):
//   - BaseCrawler.checkRobotsTxt() 호출 필수
//   - 요청 간 3~7초 랜덤 지연 (해외 사이트 봇 감지 대응)
//   - 환경변수 SOURCING_ALIEXPRESS_ENABLED 확인 필수
// =============================================

import { chromium, Browser, Page } from 'playwright'
import { createLogger } from '@smartstore/shared'
import { BaseCrawler, CrawlOptions, CrawledProduct } from '../base-crawler'
import { AliexpressProduct, AliexpressCrawlerOptions } from './types'

const logger = createLogger('aliexpress-crawler')
const ALIEXPRESS_BASE_URL = 'https://www.aliexpress.com'

/** User-Agent 로테이션 풀 (봇 감지 회피) */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
]

/** 뷰포트 크기 풀 (봇 감지 회피) */
const VIEWPORT_SIZES = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
]

export class AliexpressCrawler extends BaseCrawler {
  private browser: Browser | null = null
  private page: Page | null = null
  private proxyIndex = 0

  readonly headless: boolean
  readonly minDelayMs: number
  readonly maxDelayMs: number
  readonly maxPages: number
  private readonly proxyUrls: readonly string[]
  private readonly minOrders: number | undefined
  private readonly minRating: number | undefined

  constructor(options: AliexpressCrawlerOptions = {}) {
    super()
    this.headless = options.headless ?? true
    this.minDelayMs = options.minDelayMs ?? 3000
    this.maxDelayMs = options.maxDelayMs ?? 7000
    this.maxPages = options.maxPages ?? 3
    this.proxyUrls = Object.freeze([...(options.proxyUrls ?? [])])
    this.minOrders = options.minOrders
    this.minRating = options.minRating
  }

  get baseUrl(): string {
    return ALIEXPRESS_BASE_URL
  }

  /** 브라우저 초기화 (lazy, stealth 설정 포함) */
  private async ensureBrowser(): Promise<Page> {
    if (!this.browser) {
      const launchOptions: Record<string, unknown> = {
        headless: this.headless,
      }

      const proxy = this.getNextProxy()
      if (proxy) {
        launchOptions.proxy = { server: proxy }
      }

      this.browser = await chromium.launch(launchOptions)

      const userAgent = this.pickRandom(USER_AGENTS)
      const viewport = this.pickRandom(VIEWPORT_SIZES)

      const context = await this.browser.newContext({
        userAgent,
        viewport,
      })
      this.page = await context.newPage()
    }
    return this.page!
  }

  /** 3~7초 랜덤 지연 (봇 감지 회피 — 해외 사이트는 국내보다 길게) */
  async testRandomDelay(): Promise<void> {
    return this.randomDelay()
  }

  private async randomDelay(): Promise<void> {
    const delay = this.minDelayMs
      + Math.random() * (this.maxDelayMs - this.minDelayMs)
    await new Promise(resolve => setTimeout(resolve, delay))
  }

  /** 배열에서 랜덤 요소 선택 (불변 — 원본 배열 수정 없음) */
  private pickRandom<T>(items: readonly T[]): T {
    const index = Math.floor(Math.random() * items.length)
    return items[index]!
  }

  /** 프록시 로테이션 — 리스트를 순환하며 다음 프록시 반환 */
  getNextProxy(): string | undefined {
    if (this.proxyUrls.length === 0) return undefined

    const proxy = this.proxyUrls[this.proxyIndex % this.proxyUrls.length]
    this.proxyIndex = this.proxyIndex + 1
    return proxy
  }

  /**
   * 환경변수 확인 — SOURCING_ALIEXPRESS_ENABLED가 'true'가 아니면 throw
   * 해외 소싱은 명시적으로 활성화해야만 동작
   */
  private assertEnabled(): void {
    const enabled = process.env.SOURCING_ALIEXPRESS_ENABLED
    if (enabled !== 'true') {
      throw new Error(
        'AliExpress 크롤링이 비활성화됨. '
        + 'SOURCING_ALIEXPRESS_ENABLED=true 환경변수를 설정하세요.',
      )
    }
  }

  /**
   * 카테고리 페이지 크롤링
   * - 환경변수 확인
   * - robots.txt 확인 후 진행
   * - 페이지네이션 (maxPages까지)
   * - 품질 필터 + 카테고리 필터 적용
   */
  async crawlCategory(
    categoryUrl: string,
    crawlOptions?: CrawlOptions,
  ): Promise<AliexpressProduct[]> {
    this.assertEnabled()

    const path = categoryUrl.startsWith('http')
      ? new URL(categoryUrl).pathname
      : categoryUrl
    await this.checkRobotsTxt(ALIEXPRESS_BASE_URL, path)

    const page = await this.ensureBrowser()
    const allProducts: AliexpressProduct[] = []

    try {
      for (let pageNum = 1; pageNum <= this.maxPages; pageNum++) {
        const fullUrl = categoryUrl.startsWith('http')
          ? categoryUrl
          : `${ALIEXPRESS_BASE_URL}${categoryUrl}`

        const url = pageNum === 1
          ? fullUrl
          : `${fullUrl}${fullUrl.includes('?') ? '&' : '?'}page=${pageNum}`

        logger.info('AliExpress 카테고리 크롤링', { url, page: pageNum })
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
        await this.randomDelay()

        const products = await this.extractProductList(page)
        if (products.length === 0) break

        allProducts.push(...products)
        logger.info(`페이지 ${pageNum} 수집 완료`, { count: products.length })
      }
    } catch (error) {
      logger.error('카테고리 크롤링 실패', { categoryUrl, error })
    }

    // 품질 필터 적용 (minOrders, minRating)
    const qualityFiltered = this.filterByQuality(allProducts)

    // 카테고리 필터 적용
    const filtered = this.filterProducts(qualityFiltered, crawlOptions)

    logger.info('AliExpress 크롤링 완료', {
      total: allProducts.length,
      afterQualityFilter: qualityFiltered.length,
      afterCategoryFilter: filtered.length,
    })

    return filtered
  }

  /**
   * 상품 목록 페이지에서 상품 정보 추출
   */
  private async extractProductList(
    page: Page,
  ): Promise<AliexpressProduct[]> {
    return page.$$eval(
      '.search-item-card-wrapper-gallery, .product-snippet_ProductSnippet, .list--gallery--C2f2iC',
      (elements) => {
        return elements.map((el) => {
          const nameEl = el.querySelector(
            'h1, h3, .multi--titleText--nXeOvyr, a[title]',
          )
          const priceEl = el.querySelector(
            '.multi--price-sale--U-S0jtj, .snow-price_SnowPrice, .price-current',
          )
          const imgEl = el.querySelector('img')
          const linkEl = el.querySelector('a[href]')
          const ratingEl = el.querySelector(
            '.multi--starWrapper, .evaluation, .star-rating',
          )
          const ordersEl = el.querySelector(
            '.multi--trade--Ktbl2jB, .sale-info, .orders-count',
          )
          const storeEl = el.querySelector(
            '.cards--store--3GyJcFQ, .store-name, .shop-name',
          )
          const shippingEl = el.querySelector(
            '.multi--shippingText, .shipping-value, .free-shipping',
          )

          const href = linkEl?.getAttribute('href') ?? ''
          const idMatch = href.match(/\/item\/(\d+)\.html/)
            ?? href.match(/\/(\d+)\.html/)

          const priceText = priceEl?.textContent
            ?.replace(/[^0-9.]/g, '') ?? '0'
          const ratingText = ratingEl?.textContent
            ?.replace(/[^0-9.]/g, '') ?? '0'
          const ordersText = ordersEl?.textContent
            ?.replace(/[^0-9]/g, '') ?? '0'
          const shippingText = shippingEl?.textContent
            ?.toLowerCase()?.includes('free')
            ? '0'
            : shippingEl?.textContent?.replace(/[^0-9.]/g, '') ?? '0'

          return {
            sourceProductId: idMatch?.[1] ?? '',
            name: nameEl?.textContent?.trim() ?? '',
            category: 'General',
            overseasPrice: parseFloat(priceText) || 0,
            currency: 'USD' as const,
            shippingFee: parseFloat(shippingText) || 0,
            imageUrl: imgEl?.getAttribute('src') ?? '',
            detailUrl: href.startsWith('http')
              ? href
              : `https://www.aliexpress.com${href}`,
            rating: parseFloat(ratingText) || 0,
            orderCount: parseInt(ordersText, 10) || 0,
            storeName: storeEl?.textContent?.trim() ?? '',
          }
        }).filter(p => p.sourceProductId && p.name)
      },
    )
  }

  /**
   * 품질 필터 — minOrders / minRating 기준 미달 상품 제외
   * 불변 패턴: 원본 배열 수정 없이 새 배열 반환
   */
  filterByQuality(products: AliexpressProduct[]): AliexpressProduct[] {
    return products.filter(product => {
      if (this.minOrders !== undefined && product.orderCount < this.minOrders) {
        return false
      }
      if (this.minRating !== undefined && product.rating < this.minRating) {
        return false
      }
      return true
    })
  }

  /** uniqueKey 생성 */
  buildUniqueKey(sourceProductId: string): string {
    return this.buildProductUniqueKey('aliexpress', sourceProductId)
  }

  /** 카테고리 필터 적용 (BaseCrawler 위임) */
  filterProducts(
    products: AliexpressProduct[],
    options?: CrawlOptions,
  ): AliexpressProduct[] {
    return this.filterByCategory(
      products as unknown as CrawledProduct[],
      options,
    ) as unknown as AliexpressProduct[]
  }

  /** 브라우저 종료 */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
      this.page = null
    }
  }
}
