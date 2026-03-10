// =============================================
// 도매꾹 크롤러 구현 (Playwright 기반)
//
// 준수 사항 (CLAUDE.md 핵심 경고 #4):
//   - BaseCrawler.checkRobotsTxt() 호출 필수
//   - 요청 간 2~5초 랜덤 지연
// =============================================

import { chromium, Browser, Page } from 'playwright'
import { createLogger } from '@smartstore/shared'
import { BaseCrawler, type CrawlOptions, type CrawledProduct } from '../base-crawler'
import type { DomaeggukProduct, DomaeggukCrawlerOptions } from './types'

const logger = createLogger('domaegguk-crawler')
const DOMAEGGUK_BASE_URL = 'https://domeggook.com'

export class DomaeggukCrawler extends BaseCrawler {
  private browser: Browser | null = null
  private page: Page | null = null

  private readonly headless: boolean
  private readonly minDelayMs: number
  private readonly maxDelayMs: number
  private readonly maxPages: number

  constructor(options: DomaeggukCrawlerOptions = {}) {
    super()
    this.headless = options.headless ?? true
    this.minDelayMs = options.minDelayMs ?? 2000
    this.maxDelayMs = options.maxDelayMs ?? 5000
    this.maxPages = options.maxPages ?? 3
  }

  get baseUrl(): string {
    return DOMAEGGUK_BASE_URL
  }

  /** 브라우저 초기화 (lazy) */
  private async ensureBrowser(): Promise<Page> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: this.headless })
      const context = await this.browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      })
      this.page = await context.newPage()
    }
    return this.page!
  }

  /** 2~5초 랜덤 지연 (봇 감지 회피) */
  private async randomDelay(): Promise<void> {
    const delay = this.minDelayMs + Math.random() * (this.maxDelayMs - this.minDelayMs)
    await new Promise(resolve => setTimeout(resolve, delay))
  }

  /**
   * 카테고리 페이지 크롤링
   * - robots.txt 확인 후 진행
   * - 페이지네이션 (maxPages까지)
   * - 카테고리 필터 적용
   */
  async crawlCategory(
    categoryUrl: string,
    crawlOptions?: CrawlOptions,
  ): Promise<DomaeggukProduct[]> {
    await this.checkRobotsTxt(DOMAEGGUK_BASE_URL, new URL(categoryUrl, DOMAEGGUK_BASE_URL).pathname)

    const page = await this.ensureBrowser()
    const allProducts: DomaeggukProduct[] = []

    try {
      for (let pageNum = 1; pageNum <= this.maxPages; pageNum++) {
        const url = pageNum === 1
          ? categoryUrl
          : `${categoryUrl}${categoryUrl.includes('?') ? '&' : '?'}pg=${pageNum}`

        logger.info('도매꾹 카테고리 크롤링', { url, page: pageNum })
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
        await this.randomDelay()

        const products = await this.extractProductList(page)
        if (products.length === 0) break

        allProducts.push(...products)
        logger.info(`페이지 ${pageNum} 수집 완료`, { count: products.length })
      }
    } catch (error) {
      logger.error('카테고리 크롤링 실패', { categoryUrl, error })
    }

    // 카테고리 필터 적용
    const filtered = this.filterProducts(allProducts, crawlOptions)
    logger.info('도매꾹 크롤링 완료', {
      total: allProducts.length,
      afterFilter: filtered.length,
    })

    return filtered
  }

  /**
   * 상품 목록 페이지에서 상품 정보 추출
   *
   * 도매꾹 카테고리 페이지 HTML 구조 (2026-03 기준):
   *   #lLst > ol.lItemList > li[id^="li"]  (각 상품)
   *     a.thumb > img                       (썸네일)
   *     a.title                             (상품명 + 상세링크)
   *     .amtqty .amt > b                    (도매가)
   *     .infoDeli > b                       (배송비)
   *     .unitQty > b                        (최소주문수량)
   */
  private async extractProductList(page: Page): Promise<DomaeggukProduct[]> {
    // 카테고리명은 breadcrumb에서 한 번만 추출
    const categoryName = await page.$eval(
      '#lPathCat2',
      (el) => el.textContent?.trim() ?? '기타',
    ).catch(() => '기타')

    return page.$$eval('ol.lItemList > li[id^="li"]', (elements, category) => {
      return elements.map((el) => {
        const titleEl = el.querySelector('a.title')
        const thumbImg = el.querySelector('a.thumb img')
        const priceEl = el.querySelector('.amtqty .amt b')
        const shippingEl = el.querySelector('.infoDeli b')
        const minQtyEl = el.querySelector('.unitQty b')

        const href = titleEl?.getAttribute('href') ?? ''
        const idMatch = href.match(/\/(\d+)/)

        const priceText = priceEl?.textContent?.replace(/[^0-9]/g, '') ?? '0'
        const shippingText = shippingEl?.textContent?.replace(/[^0-9]/g, '') ?? '0'
        const minQtyText = minQtyEl?.textContent?.replace(/[^0-9]/g, '') ?? '1'

        return {
          sourceProductId: idMatch?.[1] ?? '',
          name: titleEl?.textContent?.trim() ?? '',
          category: category as string,
          wholesalePrice: parseInt(priceText, 10) || 0,
          shippingFee: parseInt(shippingText, 10) || 2500,
          imageUrl: thumbImg?.getAttribute('src') ?? '',
          detailUrl: href.startsWith('http') ? href : `https://domeggook.com${href}`,
          stockQuantity: 999,
          minOrderQuantity: parseInt(minQtyText, 10) || 1,
        }
      }).filter(p => p.sourceProductId && p.name)
    }, categoryName)
  }

  /**
   * 개별 상품 상세 페이지 크롤링
   *
   * 도매꾹 상세 페이지 HTML 구조 (2026-03 기준):
   *   URL: /{productId}
   *   상품명: #lInfoItemTitle
   *   가격: #lAmtSectionTbl td (첫 번째 = 기본 단가)
   *   이미지: img.mainThumb
   *   카테고리: #lPathCat3 > a (소분류), #lPathCat2 (대분류)
   *   재고: th "재고수량" → td
   *   배송비: th "배송금액" → td
   *   최소주문: th "구매수량" → td
   */
  async crawlProductDetail(productId: string): Promise<DomaeggukProduct | null> {
    const detailUrl = `${DOMAEGGUK_BASE_URL}/${productId}`
    await this.checkRobotsTxt(DOMAEGGUK_BASE_URL, `/${productId}`)

    const page = await this.ensureBrowser()

    try {
      await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
      await this.randomDelay()

      const product = await page.evaluate(() => {
        const name = document.querySelector('#lInfoItemTitle')?.textContent?.trim() ?? ''

        // 가격: 단가 테이블의 첫 번째 td (기본 단가)
        const priceCell = document.querySelector('#lAmtSectionTbl td')
        const priceText = priceCell?.textContent?.replace(/[^0-9]/g, '') ?? '0'

        // 이미지: 메인 썸네일
        const imgEl = document.querySelector('img.mainThumb')

        // 카테고리: breadcrumb 소분류 우선, 대분류 fallback
        const categoryEl = document.querySelector('#lPathCat3 > a') ?? document.querySelector('#lPathCat2')

        // 정보 테이블 행에서 데이터 추출 헬퍼
        const findRowValue = (label: string): string => {
          const rows = document.querySelectorAll('#lItemViewTop tr')
          for (const tr of rows) {
            const th = tr.querySelector('th')
            if (th?.textContent?.includes(label)) {
              return tr.querySelector('td')?.textContent?.trim() ?? ''
            }
          }
          return ''
        }

        const stockText = findRowValue('재고수량')
        const shippingText = findRowValue('배송금액')
        const minOrderText = findRowValue('구매수량')

        return {
          name,
          wholesalePrice: parseInt(priceText, 10) || 0,
          imageUrl: imgEl?.getAttribute('src') ?? '',
          category: categoryEl?.textContent?.trim() ?? '기타',
          stockQuantity: parseInt(stockText.replace(/[^0-9]/g, '') || '999', 10),
          shippingFee: parseInt(shippingText.replace(/[^0-9]/g, '') || '2500', 10),
          minOrderQuantity: parseInt(minOrderText.replace(/[^0-9]/g, '') || '1', 10),
        }
      })

      if (!product.name) return null

      return {
        sourceProductId: productId,
        detailUrl,
        ...product,
      }
    } catch (error) {
      logger.error('상품 상세 크롤링 실패', { productId, error })
      return null
    }
  }

  /** uniqueKey 생성 */
  buildUniqueKey(sourceProductId: string): string {
    return this.buildProductUniqueKey('domaegguk', sourceProductId)
  }

  /** 카테고리 필터 적용 */
  filterProducts(
    products: DomaeggukProduct[],
    options?: CrawlOptions,
  ): DomaeggukProduct[] {
    return this.filterByCategory(
      products as unknown as CrawledProduct[],
      options,
    ) as unknown as DomaeggukProduct[]
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
