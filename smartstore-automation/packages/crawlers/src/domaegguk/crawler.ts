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
          : `${categoryUrl}${categoryUrl.includes('?') ? '&' : '?'}page=${pageNum}`

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
   */
  private async extractProductList(page: Page): Promise<DomaeggukProduct[]> {
    return page.$$eval('.item_list .item, .goods_list .goods_item, .product-list .product-item', (elements) => {
      return elements.map((el) => {
        const nameEl = el.querySelector('.item_name, .goods_name, .product-name, a[title]')
        const priceEl = el.querySelector('.item_price, .goods_price, .product-price, .price')
        const imgEl = el.querySelector('img')
        const linkEl = el.querySelector('a[href]')
        const shippingEl = el.querySelector('.delivery, .shipping')
        const categoryEl = el.querySelector('.category, .cate')

        const href = linkEl?.getAttribute('href') ?? ''
        const idMatch = href.match(/\/(\d+)/) ?? href.match(/[?&]no=(\d+)/)

        const priceText = priceEl?.textContent?.replace(/[^0-9]/g, '') ?? '0'
        const shippingText = shippingEl?.textContent?.replace(/[^0-9]/g, '') ?? '0'

        return {
          sourceProductId: idMatch?.[1] ?? '',
          name: nameEl?.textContent?.trim() ?? '',
          category: categoryEl?.textContent?.trim() ?? '기타',
          wholesalePrice: parseInt(priceText, 10) || 0,
          shippingFee: parseInt(shippingText, 10) || 2500,
          imageUrl: imgEl?.getAttribute('src') ?? '',
          detailUrl: href.startsWith('http') ? href : `https://domeggook.com${href}`,
          stockQuantity: 999,
          minOrderQuantity: 1,
        }
      }).filter(p => p.sourceProductId && p.name)
    })
  }

  /**
   * 개별 상품 상세 페이지 크롤링
   */
  async crawlProductDetail(productId: string): Promise<DomaeggukProduct | null> {
    const detailUrl = `${DOMAEGGUK_BASE_URL}/goods/view?no=${productId}`
    await this.checkRobotsTxt(DOMAEGGUK_BASE_URL, `/goods/view`)

    const page = await this.ensureBrowser()

    try {
      await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
      await this.randomDelay()

      const product = await page.evaluate(() => {
        const name = document.querySelector('.goods_name, .product-name, h2')?.textContent?.trim() ?? ''
        const priceText = document.querySelector('.goods_price, .product-price, .price')?.textContent?.replace(/[^0-9]/g, '') ?? '0'
        const imgEl = document.querySelector('.goods_image img, .product-image img, .thumb img')
        const categoryEl = document.querySelector('.category, .breadcrumb, .cate')
        const stockEl = document.querySelector('.stock, .quantity')
        const shippingEl = document.querySelector('.delivery_fee, .shipping_fee')
        const minQtyEl = document.querySelector('.min_order, .minimum')

        return {
          name,
          wholesalePrice: parseInt(priceText, 10) || 0,
          imageUrl: imgEl?.getAttribute('src') ?? '',
          category: categoryEl?.textContent?.trim() ?? '기타',
          stockQuantity: parseInt(stockEl?.textContent?.replace(/[^0-9]/g, '') ?? '999', 10),
          shippingFee: parseInt(shippingEl?.textContent?.replace(/[^0-9]/g, '') ?? '2500', 10),
          minOrderQuantity: parseInt(minQtyEl?.textContent?.replace(/[^0-9]/g, '') ?? '1', 10),
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
