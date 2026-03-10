// =============================================
// 온채널 자동 주문 크롤러 (Playwright 기반)
//
// 준수 사항:
//   - 요청 간 2~5초 랜덤 지연 (봇 감지 회피)
//   - 개인정보(전화번호 등) 로그 기록 금지
//   - 불변성 원칙 준수
// =============================================

import { chromium, Browser, BrowserContext, Page } from 'playwright'
import { createLogger } from '@smartstore/shared'
import type { WholesaleOrderer, WholesaleOrderRequest, WholesaleOrderResult } from '../wholesale-order-types'
import type { OnchannelOrdererOptions } from './order-types'

const logger = createLogger('onchannel-orderer')
const ONCHANNEL_BASE_URL = 'https://onchannel.co.kr'

export class OnchannelOrderer implements WholesaleOrderer {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null
  private isLoggedIn = false

  private readonly headless: boolean
  private readonly minDelayMs: number
  private readonly maxDelayMs: number

  constructor(
    private readonly username: string,
    private readonly password: string,
    options?: OnchannelOrdererOptions,
  ) {
    this.headless = options?.headless ?? true
    this.minDelayMs = options?.minDelayMs ?? 2000
    this.maxDelayMs = options?.maxDelayMs ?? 5000
  }

  /** 브라우저 초기화 (lazy) */
  private async ensureBrowser(): Promise<Page> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: this.headless })
      this.context = await this.browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      })
      this.page = await this.context.newPage()
    }
    return this.page!
  }

  /** 2~5초 랜덤 지연 (봇 감지 회피) */
  private async randomDelay(): Promise<void> {
    const delay = this.minDelayMs + Math.random() * (this.maxDelayMs - this.minDelayMs)
    await new Promise(resolve => setTimeout(resolve, delay))
  }

  /**
   * 온채널 로그인
   */
  async login(): Promise<void> {
    if (this.isLoggedIn) {
      logger.info('이미 로그인 상태, 스킵')
      return
    }

    const page = await this.ensureBrowser()

    logger.info('온채널 로그인 시도', { username: this.username })
    await page.goto(`${ONCHANNEL_BASE_URL}/member/login`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    })

    // 캡차 감지
    const captchaCount = await page.locator('.captcha, #captcha, [data-captcha]').count()
    if (captchaCount > 0) {
      throw new Error('캡차 감지됨 — 수동 로그인 필요')
    }

    // credentials 입력
    await page.fill('input[name="member_id"], #member_id', this.username)
    await page.fill('input[name="member_passwd"], #member_passwd', this.password)
    await page.click('button[type="submit"], .btn_login, #loginBtn')

    await this.randomDelay()

    // 로그인 성공 여부 확인
    const currentUrl = page.url()
    if (currentUrl.includes('/login')) {
      throw new Error('로그인 실패 — 아이디 또는 비밀번호를 확인하세요')
    }

    if (this.context) {
      await this.context.storageState()
    }

    this.isLoggedIn = true
    logger.info('온채널 로그인 성공')
  }

  /**
   * 온채널 주문
   */
  async placeOrder(request: WholesaleOrderRequest): Promise<WholesaleOrderResult> {
    try {
      if (!this.isLoggedIn) {
        await this.login()
      }

      const page = await this.ensureBrowser()
      const { sourceProductId, quantity, shippingAddress, productOptions } = request

      logger.info('주문 시작', { sourceProductId, quantity })

      // 상품 페이지 이동
      await page.goto(`${ONCHANNEL_BASE_URL}/product/detail?product_no=${sourceProductId}`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      })
      await this.randomDelay()

      // 수량 입력
      await page.fill('input[name="quantity"], #quantity, .quantity_input', String(quantity))

      // 옵션 선택 (있으면)
      if (productOptions) {
        for (const [optionName, optionValue] of Object.entries(productOptions)) {
          await page.selectOption(
            `select[name="${optionName}"], #option_${optionName}`,
            optionValue,
          )
        }
      }

      // 구매하기 클릭
      await page.click('button.btn_buy, #buyBtn, .buy_button')
      await this.randomDelay()

      // 배송지 입력 (개인정보 로그 기록 금지)
      await page.fill('input[name="receiver_name"], #receiver_name', shippingAddress.name)
      await page.fill('input[name="receiver_phone"], #receiver_phone', shippingAddress.phone)
      await page.fill('input[name="receiver_address"], #receiver_address', shippingAddress.address)
      await page.fill('input[name="receiver_zipcode"], #receiver_zipcode', shippingAddress.zipCode)

      // 주문 확인 클릭
      await page.click('button.btn_order, #orderConfirmBtn, .order_confirm')
      await this.randomDelay()

      // 주문번호 추출
      const orderIdElement = await page.waitForSelector(
        '.order_number, #orderNumber, .order_id',
        { timeout: 10000 },
      )
      const wholesaleOrderId = await orderIdElement.textContent() ?? ''

      logger.info('주문 완료', { sourceProductId, wholesaleOrderId })

      return {
        success: true,
        wholesaleOrderId: wholesaleOrderId.trim(),
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 주문 오류'
      logger.error('주문 실패', { sourceProductId: request.sourceProductId, error: errorMessage })

      let screenshotPath: string | undefined
      try {
        const page = await this.ensureBrowser()
        screenshotPath = `screenshots/order-fail-onchannel-${request.sourceProductId}-${Date.now()}.png`
        await page.screenshot({ path: screenshotPath })
      } catch {
        logger.error('스크린샷 저장 실패')
      }

      return {
        success: false,
        errorMessage,
        screenshotPath,
      }
    }
  }

  /**
   * 운송장 번호 조회
   */
  async getTrackingNumber(wholesaleOrderId: string): Promise<string | null> {
    try {
      if (!this.isLoggedIn) {
        await this.login()
      }

      const page = await this.ensureBrowser()

      logger.info('운송장 조회', { wholesaleOrderId })
      await page.goto(
        `${ONCHANNEL_BASE_URL}/mypage/order/detail?order_no=${wholesaleOrderId}`,
        { waitUntil: 'domcontentloaded', timeout: 15000 },
      )
      await this.randomDelay()

      const trackingElement = await page.waitForSelector(
        '.tracking_number, #trackingNumber, .invoice_num',
        { timeout: 5000 },
      )
      const trackingNumber = await trackingElement.textContent()

      if (!trackingNumber || trackingNumber.trim() === '') {
        return null
      }

      logger.info('운송장 조회 완료', { wholesaleOrderId })
      return trackingNumber.trim()
    } catch {
      logger.info('운송장 미확인', { wholesaleOrderId })
      return null
    }
  }

  /** 주문 고유키 생성 */
  buildUniqueKey(wholesaleOrderId: string): string {
    return `onchannel-order:${wholesaleOrderId}`
  }

  /** 브라우저 종료 */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
      this.context = null
      this.page = null
      this.isLoggedIn = false
    }
  }
}
