// =============================================
// 온채널 크롤러 구현 (Playwright 기반)
//
// 준수 사항 (CLAUDE.md 핵심 경고 #4):
//   - BaseCrawler.checkRobotsTxt() 호출 필수
//   - 요청 간 2~5초 랜덤 지연
// =============================================

import { chromium, Browser, Page } from 'playwright'
import { createLogger } from '@smartstore/shared'
import { BaseCrawler, type CrawlOptions, type CrawledProduct } from '../base-crawler'
import type { OnchannelProduct, OnchannelCrawlerOptions } from './types'

const logger = createLogger('onchannel-crawler')
const ONCHANNEL_BASE_URL = 'https://onchannel.co.kr'

export class OnchannelCrawler extends BaseCrawler {
  private browser: Browser | null = null
  private page: Page | null = null

  private readonly headless: boolean
  private readonly minDelayMs: number
  private readonly maxDelayMs: number
  private readonly maxPages: number

  constructor(options: OnchannelCrawlerOptions = {}) {
    super()
    this.headless = options.headless ?? true
    this.minDelayMs = options.minDelayMs ?? 2000
    this.maxDelayMs = options.maxDelayMs ?? 5000
    this.maxPages = options.maxPages ?? 3
  }

  get baseUrl(): string {
    return ONCHANNEL_BASE_URL
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
  ): Promise<OnchannelProduct[]> {
    await this.checkRobotsTxt(ONCHANNEL_BASE_URL, new URL(categoryUrl, ONCHANNEL_BASE_URL).pathname)

    const page = await this.ensureBrowser()
    const allProducts: OnchannelProduct[] = []

    try {
      for (let pageNum = 1; pageNum <= this.maxPages; pageNum++) {
        const url = pageNum === 1
          ? categoryUrl
          : `${categoryUrl}${categoryUrl.includes('?') ? '&' : '?'}page=${pageNum}`

        logger.info('온채널 카테고리 크롤링', { url, page: pageNum })
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

    const filtered = this.filterProducts(allProducts, crawlOptions)
    logger.info('온채널 크롤링 완료', {
      total: allProducts.length,
      afterFilter: filtered.length,
    })

    return filtered
  }

  /**
   * 상품 목록 페이지에서 상품 정보 추출
   *
   * 온채널 카테고리 페이지 HTML 구조:
   *   .item_list .item_box  (각 상품)
   *     .thumb img           (썸네일)
   *     .item_name a         (상품명 + 상세링크)
   *     .item_price          (도매가)
   *     .item_delivery       (배송비)
   */
  private async extractProductList(page: Page): Promise<OnchannelProduct[]> {
    const categoryName = await page.$eval(
      '.category_path .current, .breadcrumb .active',
      (el) => el.textContent?.trim() ?? '기타',
    ).catch(() => '기타')

    return page.$$eval('.item_list .item_box, .product_list .product_item', (elements, category) => {
      return elements.map((el) => {
        const nameEl = el.querySelector('.item_name a, .product_name a')
        const thumbImg = el.querySelector('.thumb img, .product_img img')
        const priceEl = el.querySelector('.item_price, .product_price')
        const shippingEl = el.querySelector('.item_delivery, .delivery_fee')

        const href = nameEl?.getAttribute('href') ?? ''
        const idMatch = href.match(/(?:product_no|no|id)=(\d+)/) ?? href.match(/\/(\d+)/)

        const priceText = priceEl?.textContent?.replace(/[^0-9]/g, '') ?? '0'
        const shippingText = shippingEl?.textContent?.replace(/[^0-9]/g, '') ?? '0'

        return {
          sourceProductId: idMatch?.[1] ?? '',
          name: nameEl?.textContent?.trim() ?? '',
          category: category as string,
          wholesalePrice: parseInt(priceText, 10) || 0,
          shippingFee: parseInt(shippingText, 10) || 3000,
          imageUrl: thumbImg?.getAttribute('src') ?? '',
          detailUrl: href.startsWith('http') ? href : `https://onchannel.co.kr${href}`,
          stockQuantity: 999,
          minOrderQuantity: 1,
        }
      }).filter(p => p.sourceProductId && p.name)
    }, categoryName)
  }

  /**
   * 개별 상품 상세 페이지 크롤링
   *
   * 온채널 상세 페이지 HTML 구조:
   *   상품명: .product_title, h2.item_name
   *   가격: .product_price .price, .item_price
   *   이미지: .product_image img, .detail_image img
   *   카테고리: .breadcrumb, .category_path
   *   재고: .stock_quantity
   *   배송비: .delivery_info .fee
   */
  async crawlProductDetail(productId: string): Promise<OnchannelProduct | null> {
    const detailUrl = `${ONCHANNEL_BASE_URL}/product/detail?product_no=${productId}`
    await this.checkRobotsTxt(ONCHANNEL_BASE_URL, `/product/detail`)

    const page = await this.ensureBrowser()

    try {
      await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
      await this.randomDelay()

      const product = await page.evaluate(() => {
        const name = (
          document.querySelector('.product_title')?.textContent ??
          document.querySelector('h2.item_name')?.textContent ??
          ''
        ).trim()

        const priceEl = document.querySelector('.product_price .price, .item_price')
        const priceText = priceEl?.textContent?.replace(/[^0-9]/g, '') ?? '0'

        const imgEl = document.querySelector('.product_image img, .detail_image img')

        const categoryEl = document.querySelector('.breadcrumb .active, .category_path .current')

        const stockEl = document.querySelector('.stock_quantity')
        const stockText = stockEl?.textContent?.replace(/[^0-9]/g, '') ?? '999'

        const shippingEl = document.querySelector('.delivery_info .fee, .delivery_fee')
        const shippingText = shippingEl?.textContent?.replace(/[^0-9]/g, '') ?? '3000'

        return {
          name,
          wholesalePrice: parseInt(priceText, 10) || 0,
          imageUrl: imgEl?.getAttribute('src') ?? '',
          category: categoryEl?.textContent?.trim() ?? '기타',
          stockQuantity: parseInt(stockText, 10),
          shippingFee: parseInt(shippingText, 10),
          minOrderQuantity: 1,
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
    return this.buildProductUniqueKey('onchannel', sourceProductId)
  }

  /** 카테고리 필터 적용 */
  filterProducts(
    products: OnchannelProduct[],
    options?: CrawlOptions,
  ): OnchannelProduct[] {
    return this.filterByCategory(
      products as unknown as CrawledProduct[],
      options,
    ) as unknown as OnchannelProduct[]
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
