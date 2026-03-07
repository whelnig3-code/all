// =============================================
// 네이버 쇼핑 경쟁가 크롤러 (Playwright 기반)
//
// 준수 사항 (CLAUDE.md 핵심 경고 #4):
//   - BaseCrawler.checkRobotsTxt() 호출 필수 (제거 금지)
//   - 요청 간 2~5초 랜덤 지연
//   - 상위 5개 판매자만 추출
// =============================================

import { chromium, Browser, Page } from 'playwright'
import { createLogger } from '@smartstore/shared'
import { BaseCrawler } from './base-crawler'

const logger = createLogger('naver-shopping-crawler')

/** 크롤링 대상 기본 URL */
const NAVER_SHOPPING_BASE_URL = 'https://search.shopping.naver.com'

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
   * 브라우저 초기화 (lazy — 첫 크롤링 시 자동 실행)
   */
  private async ensureBrowser(): Promise<Browser> {
    if (!this.browser) {
      logger.debug('Playwright 브라우저 시작')
      this.browser = await chromium.launch({
        headless: this.options.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled', // 봇 감지 방지
        ],
      })
    }
    return this.browser
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
   * 네이버 쇼핑에서 경쟁사 가격 검색
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
    const browser = await this.ensureBrowser()
    const page: Page = await browser.newPage()

    try {
      // User-Agent 설정 (일반 브라우저처럼 보이게)
      await page.setExtraHTTPHeaders({
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      })

      // 네이버 쇼핑 검색 (가격 오름차순)
      const searchUrl = `${NAVER_SHOPPING_BASE_URL}/search/all?query=${encodeURIComponent(productName)}&sort=price_asc`
      logger.info('네이버 쇼핑 크롤링 시작', { productName, url: searchUrl })

      await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 })

      // 랜덤 지연 (2~5초)
      await this.randomDelay()

      // 상품 목록 대기
      await page.waitForSelector('[class*="basicList_item"]', { timeout: 10000 }).catch(() => {
        logger.warn('상품 목록 셀렉터 없음 — 구조 변경 가능성')
      })

      // 가격 및 판매자 추출
      const results = await page.evaluate((maxCount: number) => {
        const items = document.querySelectorAll('[class*="basicList_item"]')
        const prices: Array<{ sellerName: string; price: number }> = []

        items.forEach((item: Element, index: number) => {
          if (index >= maxCount) return

          const priceEl = item.querySelector('[class*="price_num"]')
          const sellerEl =
            item.querySelector('[class*="mall_name"]') ??
            item.querySelector('[class*="seller_name"]')

          if (!priceEl) return

          const priceText = priceEl.textContent?.replace(/[^0-9]/g, '') ?? ''
          const price = parseInt(priceText, 10)
          if (!price || isNaN(price)) return

          const sellerName = sellerEl?.textContent?.trim() ?? `판매자${index + 1}`
          prices.push({ sellerName, price })
        })

        return prices
      }, limit)

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
      // 페이지는 매번 닫아 메모리 누수 방지
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

    const browser = await this.ensureBrowser()
    const page: Page = await browser.newPage()

    try {
      // User-Agent 설정 (일반 브라우저처럼 보이게)
      await page.setExtraHTTPHeaders({
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      })

      // 기본 정렬(관련순)로 검색 — 네이버 노출 순위 기준
      const searchUrl = `${NAVER_SHOPPING_BASE_URL}/search/all?query=${encodeURIComponent(keyword)}`
      logger.info('노출 가능성 분석 크롤링 시작', { keyword, url: searchUrl })

      await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 })

      // 랜덤 지연 (2~5초)
      await this.randomDelay()

      // 상품 목록 대기
      await page.waitForSelector('[class*="basicList_item"]', { timeout: 10000 }).catch(() => {
        logger.warn('상품 목록 셀렉터 없음 — 구조 변경 가능성')
      })

      // 상위 20개 상품 데이터 추출 (브라우저 컨텍스트에서 실행)
      const result = await page.evaluate(() => {
        const items = document.querySelectorAll('[class*="basicList_item"]')

        let adCount = 0
        let totalReview = 0
        let reviewSampleCount = 0
        let brandCountTop10 = 0
        let totalPrice = 0
        let priceSampleCount = 0

        items.forEach((item: Element, index: number) => {
          // 상위 20개만 분석
          if (index >= 20) return

          // ① 광고 여부 — 네이버 쇼핑 광고 배지 선택자
          const isAd =
            item.querySelector('[class*="adBadge"]') !== null ||
            item.querySelector('[class*="ad_badge"]') !== null ||
            item.querySelector('[class*="ad_icon"]') !== null ||
            item.querySelector('[class*="ad_label"]') !== null
          if (isAd) adCount++

          // ② 리뷰 수 — 다양한 클래스 패턴 대응
          const reviewEl =
            item.querySelector('[class*="reviewCount"]') ??
            item.querySelector('[class*="review_num"]') ??
            item.querySelector('[class*="count_num"]')
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
              item.querySelector('[class*="brand_badge"]') !== null
            if (isBrand) brandCountTop10++
          }

          // ④ 가격 — 최저가 기준 추출
          const priceEl = item.querySelector('[class*="price_num"]')
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
      })

      logger.info('노출 가능성 분석 완료', {
        keyword,
        adCount: result.adCount,
        avgReview: result.avgReview,
        brandCountTop10: result.brandCountTop10,
        avgTopPrice: result.avgTopPrice,
      })

      return result
    } catch (error) {
      // 크롤링 실패 → fail-safe (등록 허용 방향으로 처리)
      logger.error('노출 가능성 분석 실패 — fail-safe 기본값 반환', { keyword, error })
      return FALLBACK
    } finally {
      await page.close()
    }
  }

  /**
   * 브라우저 종료 (워커 종료 시 호출)
   * 중복 호출 안전 (idempotent) — browser가 null이면 아무 동작도 하지 않는다.
   */
  async close(): Promise<void> {
    if (this.browser) {
      const b = this.browser
      this.browser = null // 먼저 null 처리 → 중복 close 방지
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
