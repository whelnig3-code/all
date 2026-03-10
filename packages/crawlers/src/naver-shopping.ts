// =============================================
// 네이버 쇼핑 경쟁가 크롤러 (Playwright + API fallback)
//
// 준수 사항 (CLAUDE.md 핵심 경고 #4):
//   - BaseCrawler.checkRobotsTxt() 호출 필수 (제거 금지)
//   - 요청 간 2~5초 랜덤 지연
//   - 상위 5개 판매자만 추출
//
// 2026-03 셀렉터 수정:
//   - basicList_item → product_item (네이버 UI 구조 변경 대응)
//   - Playwright 0건 시 네이버 검색 API fallback 추가
//   - 봇 탐지 우회 강화 (BrowserContext + webdriver 속성 제거)
// =============================================

import { chromium, Browser, BrowserContext, Page } from 'playwright'
import { createLogger } from '@smartstore/shared'
import { BaseCrawler } from './base-crawler'

const logger = createLogger('naver-shopping-crawler')

/** 크롤링 대상 기본 URL */
const NAVER_SHOPPING_BASE_URL = 'https://search.shopping.naver.com'

/** 네이버 검색 API (Playwright fallback) */
const NAVER_SEARCH_API_URL = 'https://openapi.naver.com/v1/search/shop.json'

/**
 * 상품 목록 컨테이너 셀렉터 후보 (네이버 쇼핑은 해시 접미사가 빌드마다 바뀜)
 * 구→신 순서로 시도하여 하나라도 매칭되면 사용
 */
const PRODUCT_ITEM_SELECTORS = [
  '[class*="product_item"]',
  '[class*="productItem"]',
  '[class*="basicList_item"]',
  '[class*="product_info_area"]',
] as const

/** 가격 요소 셀렉터 후보 */
const PRICE_SELECTORS = [
  '[class*="price_num"]',
  '[class*="price_area"] [class*="num"]',
  '[class*="product_price"] [class*="num"]',
] as const

/** 판매자 요소 셀렉터 후보 */
const SELLER_SELECTORS = [
  '[class*="product_mall"]',
  '[class*="mall_name"]',
  '[class*="seller_name"]',
  '[class*="mall_title"]',
] as const

/** 경쟁사 가격 항목 */
export interface CompetitorPrice {
  sellerName: string
  price: number
  rank: number
}

/**
 * 상위 20개 상품 분석 결과 (노출 가능성 점수 입력용)
 * calculateExposureScore(ExposureScoreInput) 와 1:1 매핑
 */
export interface Top20ProductsResult {
  /** 광고 상품 수 (상위 20개 중) */
  adCount: number
  /** 상위 상품 평균 리뷰 수 */
  avgReview: number
  /** 상위 10개 중 브랜드 상품 수 (0~10) */
  brandCountTop10: number
  /** 상위 상품 평균 가격 (원, 0이면 데이터 없음) */
  avgTopPrice: number
}

/** 크롤러 옵션 */
interface CrawlerOptions {
  /** 브라우저 헤드리스 모드 (기본 true) */
  headless?: boolean
  /** 최대 추출 결과 수 (기본 5) */
  maxResults?: number
  /** 요청 최소 지연 ms (기본 2000) */
  minDelayMs?: number
  /** 요청 최대 지연 ms (기본 5000) */
  maxDelayMs?: number
}

/**
 * 네이버 쇼핑 경쟁가 크롤러
 * BaseCrawler를 상속하여 robots.txt 체크 보장
 *
 * @example
 * const crawler = new NaverShoppingCrawler()
 * const prices = await crawler.fetchCompetitorPrices('무선 이어폰')
 * await crawler.close()
 */
export class NaverShoppingCrawler extends BaseCrawler {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private readonly options: Required<CrawlerOptions>

  constructor(options: CrawlerOptions = {}) {
    super()
    this.options = {
      headless: options.headless ?? true,
      maxResults: options.maxResults ?? 5,
      minDelayMs: options.minDelayMs ?? 2000,
      maxDelayMs: options.maxDelayMs ?? 5000,
    }
  }

  /**
   * 브라우저 + 컨텍스트 초기화 (lazy — 첫 크롤링 시 자동 실행)
   * BrowserContext를 사용하여 일반 사용자 브라우저처럼 보이게 설정
   */
  private async ensureBrowser(): Promise<BrowserContext> {
    if (!this.browser) {
      logger.debug('Playwright 브라우저 시작')
      this.browser = await chromium.launch({
        headless: this.options.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
        ],
      })
      this.context = await this.browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        locale: 'ko-KR',
        viewport: { width: 1920, height: 1080 },
        extraHTTPHeaders: {
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      })
      // navigator.webdriver = undefined (봇 탐지 우회)
      await this.context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
      })
    }
    return this.context!
  }

  /**
   * 2~5초 사이 랜덤 지연 (서버 부하 방지)
   */
  private async randomDelay(): Promise<void> {
    const { minDelayMs, maxDelayMs } = this.options
    const delay = Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs
    logger.debug(`크롤링 지연: ${delay}ms`)
    await new Promise((resolve) => setTimeout(resolve, delay))
  }

  /**
   * 여러 셀렉터 후보 중 실제 매칭되는 첫 번째 셀렉터로 대기
   * 모두 실패 시 null 반환
   */
  private async waitForAnySelector(
    page: Page,
    selectors: readonly string[],
    timeout: number,
  ): Promise<string | null> {
    const selectorStr = selectors.join(', ')
    try {
      await page.waitForSelector(selectorStr, { timeout })
      // 어떤 셀렉터가 매칭되었는지 확인
      for (const sel of selectors) {
        const count = await page.locator(sel).count()
        if (count > 0) {
          logger.debug(`상품 셀렉터 매칭: ${sel} (${count}건)`)
          return sel
        }
      }
    } catch {
      logger.warn('모든 상품 목록 셀렉터 매칭 실패 — 구조 변경 또는 봇 차단 가능성', {
        tried: selectors,
      })
    }
    return null
  }

  /**
   * 네이버 검색 API를 통한 경쟁가 조회 (Playwright fallback)
   * 환경변수 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 필요
   */
  private async fetchPricesViaApi(
    productName: string,
    maxResults: number,
    sort: 'sim' | 'asc' = 'asc',
  ): Promise<CompetitorPrice[]> {
    const clientId = process.env.NAVER_CLIENT_ID
    const clientSecret = process.env.NAVER_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      logger.warn('네이버 API 키 미설정 — API fallback 불가')
      return []
    }

    const url = `${NAVER_SEARCH_API_URL}?query=${encodeURIComponent(productName)}&display=${maxResults}&sort=${sort}`
    logger.info('네이버 검색 API fallback 시작', { productName, sort })

    try {
      const res = await fetch(url, {
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
        },
        signal: AbortSignal.timeout(10000),
      })

      if (!res.ok) {
        logger.error('네이버 검색 API 응답 오류', { status: res.status })
        return []
      }

      const data = (await res.json()) as {
        items?: Array<{
          title: string
          lprice: string
          mallName: string
        }>
      }

      const items = data.items ?? []
      return items.map((item, idx) => ({
        sellerName: item.mallName || `판매자${idx + 1}`,
        price: parseInt(item.lprice, 10) || 0,
        rank: idx + 1,
      })).filter((p) => p.price > 0)
    } catch (error) {
      logger.error('네이버 검색 API fallback 실패', { productName, error })
      return []
    }
  }

  /**
   * 네이버 쇼핑에서 경쟁사 가격 검색
   * 1차: Playwright 크롤링, 2차: 네이버 검색 API fallback
   * robots.txt 확인 후 크롤링 진행 (BaseCrawler.checkRobotsTxt 호출)
   *
   * @param productName 검색할 상품명
   * @param maxResults  최대 결과 수 (기본: 옵션 설정값)
   * @returns 경쟁사 가격 목록 (rank 오름차순)
   */
  async fetchCompetitorPrices(
    productName: string,
    maxResults?: number,
  ): Promise<CompetitorPrice[]> {
    // robots.txt 확인 — 차단 시 Error throw (CLAUDE.md 경고 #4)
    await this.checkRobotsTxt(NAVER_SHOPPING_BASE_URL, '/search/all')

    const limit = maxResults ?? this.options.maxResults

    // 1차: Playwright 크롤링 시도
    const playwrightResults = await this.fetchPricesViaPlaywright(productName, limit)
    if (playwrightResults.length > 0) {
      return playwrightResults
    }

    // 2차: API fallback (Playwright가 0건일 때)
    logger.info('Playwright 크롤링 0건 — 네이버 검색 API fallback 전환', { productName })
    await this.randomDelay()
    return this.fetchPricesViaApi(productName, limit, 'asc')
  }

  /**
   * Playwright로 네이버 쇼핑 경쟁가 크롤링 (내부 메서드)
   */
  private async fetchPricesViaPlaywright(
    productName: string,
    limit: number,
  ): Promise<CompetitorPrice[]> {
    const ctx = await this.ensureBrowser()
    const page: Page = await ctx.newPage()

    try {
      const searchUrl = `${NAVER_SHOPPING_BASE_URL}/search/all?query=${encodeURIComponent(productName)}&sort=price_asc`
      logger.info('네이버 쇼핑 크롤링 시작', { productName, url: searchUrl })

      await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 })

      // 랜덤 지연 (2~5초)
      await this.randomDelay()

      // 다중 셀렉터로 상품 목록 대기
      const matchedSelector = await this.waitForAnySelector(
        page,
        PRODUCT_ITEM_SELECTORS,
        10000,
      )
      if (!matchedSelector) {
        return []
      }

      // 가격 및 판매자 추출
      const results = await page.evaluate(
        (args: { selector: string; priceSelectors: string[]; sellerSelectors: string[]; maxCount: number }) => {
          const items = document.querySelectorAll(args.selector)
          const prices: Array<{ sellerName: string; price: number }> = []

          items.forEach((item: Element, index: number) => {
            if (index >= args.maxCount) return

            // 가격 — 여러 셀렉터 시도
            let priceEl: Element | null = null
            for (const sel of args.priceSelectors) {
              priceEl = item.querySelector(sel)
              if (priceEl) break
            }

            // 판매자 — 여러 셀렉터 시도
            let sellerEl: Element | null = null
            for (const sel of args.sellerSelectors) {
              sellerEl = item.querySelector(sel)
              if (sellerEl) break
            }

            if (!priceEl) return

            const priceText = priceEl.textContent?.replace(/[^0-9]/g, '') ?? ''
            const price = parseInt(priceText, 10)
            if (!price || isNaN(price)) return

            const sellerName = sellerEl?.textContent?.trim() ?? `판매자${index + 1}`
            prices.push({ sellerName, price })
          })

          return prices
        },
        {
          selector: matchedSelector,
          priceSelectors: [...PRICE_SELECTORS],
          sellerSelectors: [...SELLER_SELECTORS],
          maxCount: limit,
        },
      )

      const competitorPrices: CompetitorPrice[] = results.map(
        (r: { sellerName: string; price: number }, idx: number) => ({
          ...r,
          rank: idx + 1,
        }),
      )

      logger.info(`경쟁가 ${competitorPrices.length}개 추출 완료`, {
        productName,
        prices: competitorPrices.map((p) => `${p.sellerName}: ${p.price.toLocaleString()}원`),
      })

      return competitorPrices
    } catch (error) {
      logger.error('네이버 쇼핑 크롤링 실패', { productName, error })
      return []
    } finally {
      await page.close()
    }
  }

  /**
   * 네이버 쇼핑 상위 20개 상품 분석 (노출 가능성 점수용)
   *
   * 수집 항목:
   *   - adCount       : 상위 20개 중 광고 상품 수
   *   - avgReview     : 상위 상품 평균 리뷰 수
   *   - brandCountTop10 : 상위 10개 중 브랜드 상품 수
   *   - avgTopPrice   : 상위 상품 평균 가격
   *
   * 오류 발생 시 fail-safe: { adCount: 0, avgReview: 0, brandCountTop10: 0, avgTopPrice: 0 }
   * (점수 계산 시 중립/최적값으로 처리 → 등록 허용 쪽으로 기울어짐)
   *
   * @param keyword 검색 키워드 (상품명)
   * @returns Top20ProductsResult
   */
  async fetchTop20Products(keyword: string): Promise<Top20ProductsResult> {
    // 크롤링 실패 시 반환할 fail-safe 기본값 (노출 점수가 높게 나와 등록 차단 없음)
    const FALLBACK: Top20ProductsResult = {
      adCount: 0,
      avgReview: 0,
      brandCountTop10: 0,
      avgTopPrice: 0,
    }

    // robots.txt 확인 — 차단 시 Error throw (CLAUDE.md 경고 #4)
    await this.checkRobotsTxt(NAVER_SHOPPING_BASE_URL, '/search/all')

    // 1차: Playwright 크롤링 시도
    const playwrightResult = await this.fetchTop20ViaPlaywright(keyword)
    if (playwrightResult) {
      return playwrightResult
    }

    // 2차: API fallback — 부분 데이터만 추출 가능 (광고/브랜드 정보 없음)
    logger.info('Playwright 크롤링 실패 — 네이버 검색 API fallback 전환', { keyword })
    await this.randomDelay()
    return this.fetchTop20ViaApi(keyword, FALLBACK)
  }

  /**
   * Playwright로 상위 20개 상품 분석 (내부 메서드)
   * 실패 시 null 반환 (API fallback 트리거)
   */
  private async fetchTop20ViaPlaywright(keyword: string): Promise<Top20ProductsResult | null> {
    const ctx = await this.ensureBrowser()
    const page: Page = await ctx.newPage()

    try {
      const searchUrl = `${NAVER_SHOPPING_BASE_URL}/search/all?query=${encodeURIComponent(keyword)}`
      logger.info('노출 가능성 분석 크롤링 시작', { keyword, url: searchUrl })

      await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 })

      // 랜덤 지연 (2~5초)
      await this.randomDelay()

      // 다중 셀렉터로 상품 목록 대기
      const matchedSelector = await this.waitForAnySelector(
        page,
        PRODUCT_ITEM_SELECTORS,
        10000,
      )
      if (!matchedSelector) {
        return null
      }

      // 상위 20개 상품 데이터 추출 (브라우저 컨텍스트에서 실행)
      const result = await page.evaluate(
        (args: { selector: string; priceSelectors: string[] }) => {
          const items = document.querySelectorAll(args.selector)

          let adCount = 0
          let totalReview = 0
          let reviewSampleCount = 0
          let brandCountTop10 = 0
          let totalPrice = 0
          let priceSampleCount = 0

          items.forEach((item: Element, index: number) => {
            if (index >= 20) return

            // ① 광고 여부 — 다중 셀렉터 대응
            const isAd =
              item.querySelector('[class*="adBadge"]') !== null ||
              item.querySelector('[class*="ad_badge"]') !== null ||
              item.querySelector('[class*="ad_icon"]') !== null ||
              item.querySelector('[class*="ad_label"]') !== null ||
              item.querySelector('[class*="ad_area"]') !== null
            if (isAd) adCount++

            // ② 리뷰 수 — 다양한 클래스 패턴 대응
            const reviewEl =
              item.querySelector('[class*="reviewCount"]') ??
              item.querySelector('[class*="review_num"]') ??
              item.querySelector('[class*="count_num"]') ??
              item.querySelector('[class*="product_num"]')
            if (reviewEl) {
              const reviewText = reviewEl.textContent?.replace(/[^0-9]/g, '') ?? ''
              const review = parseInt(reviewText, 10)
              if (!isNaN(review) && review >= 0) {
                totalReview += review
                reviewSampleCount++
              }
            }

            // ③ 브랜드 여부 (상위 10개만) — 브랜드 태그/배지 감지
            if (index < 10) {
              const isBrand =
                item.querySelector('[class*="brandName"]') !== null ||
                item.querySelector('[class*="brand_name"]') !== null ||
                item.querySelector('[class*="brand_tag"]') !== null ||
                item.querySelector('[class*="brand_badge"]') !== null ||
                item.querySelector('[class*="product_brand"]') !== null
              if (isBrand) brandCountTop10++
            }

            // ④ 가격 — 다중 셀렉터 대응
            let priceEl: Element | null = null
            for (const sel of args.priceSelectors) {
              priceEl = item.querySelector(sel)
              if (priceEl) break
            }
            if (priceEl) {
              const priceText = priceEl.textContent?.replace(/[^0-9]/g, '') ?? ''
              const price = parseInt(priceText, 10)
              if (!isNaN(price) && price > 0) {
                totalPrice += price
                priceSampleCount++
              }
            }
          })

          return {
            adCount,
            avgReview: reviewSampleCount > 0 ? Math.round(totalReview / reviewSampleCount) : 0,
            brandCountTop10,
            avgTopPrice: priceSampleCount > 0 ? Math.round(totalPrice / priceSampleCount) : 0,
          }
        },
        {
          selector: matchedSelector,
          priceSelectors: [...PRICE_SELECTORS],
        },
      )

      logger.info('노출 가능성 분석 완료', {
        keyword,
        adCount: result.adCount,
        avgReview: result.avgReview,
        brandCountTop10: result.brandCountTop10,
        avgTopPrice: result.avgTopPrice,
      })

      return result
    } catch (error) {
      logger.error('노출 가능성 분석 Playwright 실패', { keyword, error })
      return null
    } finally {
      await page.close()
    }
  }

  /**
   * 네이버 검색 API를 통한 상위 20개 상품 분석 (fallback)
   * API로는 광고/브랜드 정보를 얻을 수 없으므로 가격과 일부 데이터만 추출
   */
  private async fetchTop20ViaApi(
    keyword: string,
    fallback: Top20ProductsResult,
  ): Promise<Top20ProductsResult> {
    const clientId = process.env.NAVER_CLIENT_ID
    const clientSecret = process.env.NAVER_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      logger.warn('네이버 API 키 미설정 — API fallback 불가, fail-safe 반환')
      return fallback
    }

    const url = `${NAVER_SEARCH_API_URL}?query=${encodeURIComponent(keyword)}&display=20&sort=sim`

    try {
      const res = await fetch(url, {
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
        },
        signal: AbortSignal.timeout(10000),
      })

      if (!res.ok) {
        logger.error('네이버 검색 API 응답 오류 (Top20)', { status: res.status })
        return fallback
      }

      const data = (await res.json()) as {
        items?: Array<{
          title: string
          lprice: string
          mallName: string
          brand: string
        }>
      }

      const items = data.items ?? []
      if (items.length === 0) {
        return fallback
      }

      // API에서 추출 가능한 데이터만 활용
      let totalPrice = 0
      let priceSampleCount = 0
      let brandCountTop10 = 0

      items.forEach((item, index) => {
        const price = parseInt(item.lprice, 10)
        if (!isNaN(price) && price > 0) {
          totalPrice += price
          priceSampleCount++
        }
        // 브랜드 여부 (상위 10개)
        if (index < 10 && item.brand && item.brand.trim().length > 0) {
          brandCountTop10++
        }
      })

      const result: Top20ProductsResult = {
        adCount: 0, // API로는 광고 여부 판별 불가 → 0 (중립값)
        avgReview: 0, // API에 리뷰 수 없음 → 0 (중립값)
        brandCountTop10,
        avgTopPrice: priceSampleCount > 0 ? Math.round(totalPrice / priceSampleCount) : 0,
      }

      logger.info('노출 가능성 분석 API fallback 완료', { keyword, ...result })
      return result
    } catch (error) {
      logger.error('네이버 검색 API Top20 fallback 실패', { keyword, error })
      return fallback
    }
  }

  /**
   * 브라우저 종료 (워커 종료 시 호출)
   * 중복 호출 안전 (idempotent) — browser가 null이면 아무 동작도 하지 않는다.
   */
  async close(): Promise<void> {
    if (this.browser) {
      const ctx = this.context
      const b = this.browser
      this.context = null
      this.browser = null // 먼저 null 처리 → 중복 close 방지
      if (ctx) await ctx.close()
      await b.close()
      logger.debug('Playwright 브라우저 종료')
    }
  }
}

/** 싱글톤 인스턴스 (워커 프로세스당 1개 재사용) */
export const naverShoppingCrawler = new NaverShoppingCrawler()

// 프로세스 종료 시 Playwright 브라우저 자원 회수
// global 플래그로 핸들러 중복 등록 방지 (jest.resetModules 등 모듈 재로딩 시에도 안전)
const _g = global as typeof globalThis & { __naverShoppingHandlersRegistered?: boolean }
if (!_g.__naverShoppingHandlersRegistered) {
  _g.__naverShoppingHandlersRegistered = true

  // SIGTERM: Docker/K8s graceful shutdown 신호
  process.on('SIGTERM', () => {
    logger.info('SIGTERM 수신 — Playwright 브라우저 종료 중')
    naverShoppingCrawler
      .close()
      .catch((err: unknown) => logger.error('SIGTERM close 실패', err))
      .finally(() => process.exit(0))
  })

  // SIGINT: Ctrl+C 종료 (개발 환경)
  process.on('SIGINT', () => {
    logger.info('SIGINT 수신 — Playwright 브라우저 종료 중')
    naverShoppingCrawler
      .close()
      .catch((err: unknown) => logger.error('SIGINT close 실패', err))
      .finally(() => process.exit(0))
  })
}
