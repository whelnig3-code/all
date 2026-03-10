// =============================================
// 타오바오 크롤러 구현 (Playwright 기반)
//
// 준수 사항 (CLAUDE.md 핵심 경고 #4):
//   - BaseCrawler.checkRobotsTxt() 호출 필수
//   - 요청 간 4~8초 랜덤 지연 (타오바오 봇 감지 대응)
//   - 쿠키 기반 세션 필수
// =============================================

import { chromium, Browser, BrowserContext, Page } from 'playwright'
import { createLogger } from '@smartstore/shared'
import { BaseCrawler, type CrawlOptions, type CrawledProduct } from '../base-crawler'
import type { TaobaoProduct, TaobaoCrawlerOptions } from './types'

const logger = createLogger('taobao-crawler')

const TAOBAO_BASE_URL = 'https://www.taobao.com'
const TAOBAO_SEARCH_URL = 'https://s.taobao.com'

export class TaobaoCrawler extends BaseCrawler {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null

  readonly headless: boolean
  readonly minDelayMs: number
  readonly maxDelayMs: number
  readonly maxPages: number
  private readonly cookieString: string | undefined
  private readonly minMonthlySales: number | undefined

  constructor(options: TaobaoCrawlerOptions = {}) {
    super()
    this.headless = options.headless ?? true
    this.minDelayMs = options.minDelayMs ?? 4000
    this.maxDelayMs = options.maxDelayMs ?? 8000
    this.maxPages = options.maxPages ?? 3
    this.cookieString = options.cookieString
    this.minMonthlySales = options.minMonthlySales
  }

  get baseUrl(): string {
    return TAOBAO_BASE_URL
  }

  /** uniqueKey 생성 — DB 저장 전 반드시 호출 */
  buildUniqueKey(sourceProductId: string): string {
    return this.buildProductUniqueKey('taobao', sourceProductId)
  }

  /**
   * 지연 시간 계산 (테스트용 public 메서드)
   * 4~8초 범위의 랜덤 지연
   */
  calculateDelay(): number {
    return this.minDelayMs + Math.random() * (this.maxDelayMs - this.minDelayMs)
  }

  /**
   * 뷰포트 크기 생성 (테스트용 public 메서드)
   * width: 1200-1600, height: 800-1000
   */
  generateViewport(): { width: number; height: number } {
    return {
      width: Math.floor(1200 + Math.random() * 400),
      height: Math.floor(800 + Math.random() * 200),
    }
  }

  /** 환경 변수 및 쿠키 사전 검증 */
  private validatePreConditions(): void {
    if (!this.cookieString) {
      throw new Error('타오바오 크롤링에는 로그인 쿠키가 필요합니다')
    }

    const enabled = process.env.SOURCING_TAOBAO_ENABLED
    if (enabled !== 'true') {
      throw new Error(
        'SOURCING_TAOBAO_ENABLED 환경 변수가 활성화되지 않았습니다',
      )
    }
  }

  /**
   * 쿠키 문자열을 Playwright 쿠키 배열로 파싱
   * "key1=val1; key2=val2" → [{ name, value, domain, path }]
   */
  private parseCookies(
    cookieStr: string,
  ): Array<{ name: string; value: string; domain: string; path: string }> {
    return cookieStr
      .split(';')
      .map(pair => pair.trim())
      .filter(Boolean)
      .map(pair => {
        const eqIndex = pair.indexOf('=')
        const name = eqIndex > 0 ? pair.slice(0, eqIndex).trim() : pair.trim()
        const value = eqIndex > 0 ? pair.slice(eqIndex + 1).trim() : ''
        return {
          name,
          value,
          domain: '.taobao.com',
          path: '/',
        }
      })
  }

  /** 브라우저 초기화 (lazy) — 쿠키 주입 + 뷰포트 랜덤화 */
  private async ensureBrowser(): Promise<Page> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: this.headless })
      const viewport = this.generateViewport()
      this.context = await this.browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        viewport,
      })

      // 쿠키 주입
      if (this.cookieString) {
        const cookies = this.parseCookies(this.cookieString)
        await this.context.addCookies(cookies)
      }

      this.page = await this.context.newPage()
    }
    return this.page!
  }

  /** 4~8초 랜덤 지연 (봇 감지 회피) */
  private async randomDelay(): Promise<void> {
    const delay = this.calculateDelay()
    await new Promise(resolve => setTimeout(resolve, delay))
  }

  /**
   * 키워드 검색 크롤링
   * - 환경 변수 및 쿠키 검증
   * - robots.txt 확인 후 진행
   * - 페이지네이션 (maxPages까지)
   * - 월 판매량 필터 적용
   */
  async crawlSearch(
    keyword: string,
    crawlOptions?: CrawlOptions,
  ): Promise<TaobaoProduct[]> {
    this.validatePreConditions()

    await this.checkRobotsTxt(TAOBAO_SEARCH_URL, '/search')

    const page = await this.ensureBrowser()
    const allProducts: TaobaoProduct[] = []

    try {
      for (let pageNum = 1; pageNum <= this.maxPages; pageNum++) {
        const encodedKeyword = encodeURIComponent(keyword)
        const url =
          pageNum === 1
            ? `${TAOBAO_SEARCH_URL}/search?q=${encodedKeyword}`
            : `${TAOBAO_SEARCH_URL}/search?q=${encodedKeyword}&s=${(pageNum - 1) * 44}`

        logger.info('타오바오 검색 크롤링', { url, page: pageNum, keyword })
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
        await this.randomDelay()

        const products = await this.extractSearchResults(page)
        if (products.length === 0) break

        allProducts.push(...products)
        logger.info(`페이지 ${pageNum} 수집 완료`, { count: products.length })
      }
    } catch (error) {
      logger.error('검색 크롤링 실패', { keyword, error })
    }

    // 월 판매량 필터
    const salesFiltered = this.filterByMonthlySales(allProducts)

    // 카테고리 필터
    const filtered = this.filterProducts(salesFiltered, crawlOptions)

    logger.info('타오바오 크롤링 완료', {
      total: allProducts.length,
      afterSalesFilter: salesFiltered.length,
      afterCategoryFilter: filtered.length,
    })

    return filtered
  }

  /** 검색 결과 페이지에서 상품 정보 추출 */
  private async extractSearchResults(page: Page): Promise<TaobaoProduct[]> {
    return page.$$eval(
      '.Content--contentInner--QVTcU0M .Card--doubleCardWrapper--L2XFE73',
      elements => {
        return elements
          .map(el => {
            const nameEl = el.querySelector(
              '.Title--title--jCOPvpf span',
            )
            const priceEl = el.querySelector(
              '.Price--priceInt--ZlsSi_M',
            )
            const priceDecEl = el.querySelector(
              '.Price--priceDec--YRiOmi9',
            )
            const imgEl = el.querySelector('img')
            const linkEl = el.querySelector('a[href]')
            const salesEl = el.querySelector(
              '.Price--realSales--FhTZc7U',
            )
            const storeEl = el.querySelector(
              '.ShopInfo--TextAndPic--yH0AZfx',
            )
            const ratingEl = el.querySelector(
              '.ShopInfo--shopIcon--wm1_Y9E',
            )

            const href = linkEl?.getAttribute('href') ?? ''
            const idMatch = href.match(/[?&]id=(\d+)/)

            const priceInt = priceEl?.textContent?.replace(/[^0-9]/g, '') ?? '0'
            const priceDec =
              priceDecEl?.textContent?.replace(/[^0-9]/g, '') ?? '0'
            const price = parseFloat(`${priceInt}.${priceDec}`) || 0

            const salesText =
              salesEl?.textContent?.replace(/[^0-9]/g, '') ?? '0'

            return {
              sourceProductId: idMatch?.[1] ?? '',
              name: nameEl?.textContent?.trim() ?? '',
              category: '기타',
              overseasPrice: price,
              currency: 'CNY' as const,
              shippingFee: 0,
              imageUrl: imgEl?.getAttribute('src') ?? '',
              detailUrl: href.startsWith('http')
                ? href
                : `https://item.taobao.com/item.htm?id=${idMatch?.[1] ?? ''}`,
              monthlySales: parseInt(salesText, 10) || 0,
              storeName: storeEl?.textContent?.trim() ?? '',
              storeRating: parseFloat(
                ratingEl?.textContent?.replace(/[^0-9.]/g, '') ?? '0',
              ),
            }
          })
          .filter(p => p.sourceProductId && p.name)
      },
    )
  }

  /** 월 판매량 필터 — minMonthlySales 이상인 상품만 반환 */
  filterByMonthlySales(products: TaobaoProduct[]): TaobaoProduct[] {
    if (this.minMonthlySales == null) return [...products]

    const threshold = this.minMonthlySales
    return products.filter(p => p.monthlySales >= threshold)
  }

  /** 카테고리 필터 — BaseCrawler의 filterByCategory 활용 */
  filterProducts(
    products: TaobaoProduct[],
    options?: CrawlOptions,
  ): TaobaoProduct[] {
    return this.filterByCategory(
      products as unknown as CrawledProduct[],
      options,
    ) as unknown as TaobaoProduct[]
  }

  /** 브라우저 종료 */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
      this.context = null
      this.page = null
    }
  }
}
