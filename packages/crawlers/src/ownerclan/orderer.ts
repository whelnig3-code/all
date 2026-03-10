// =============================================
// 오너클랜 자동 주문 크롤러 (Playwright 기반)
//
// 준수 사항:
//   - 요청 간 랜덤 지연
//   - 캡차 감지 시 즉시 중단
//   - 로그에 개인정보(전화번호) 기록 금지
// =============================================

import { chromium, Browser, BrowserContext, Page } from 'playwright'
import { createLogger } from '@smartstore/shared'
import type {
  WholesaleOrderer,
  WholesaleOrderRequest,
  WholesaleOrderResult,
  OwnerclanOrdererOptions,
} from './order-types'

const logger = createLogger('ownerclan-orderer')
const OWNERCLAN_BASE_URL = 'https://ownerclan.com'
const LOGIN_URL = `${OWNERCLAN_BASE_URL}/login`
const ORDER_HISTORY_URL = `${OWNERCLAN_BASE_URL}/mypage/orders`

export class OwnerclanOrderer implements WholesaleOrderer {
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
    options?: OwnerclanOrdererOptions,
  ) {
    this.headless = options?.headless ?? true
    this.minDelayMs = options?.minDelayMs ?? 2000
    this.maxDelayMs = options?.maxDelayMs ?? 5000
  }

  // ----- Public API -----

  async login(): Promise<void> {
    if (this.isLoggedIn) {
      logger.debug('이미 로그인 상태, 스킵')
      return
    }

    const page = await this.ensureBrowser()

    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await this.randomDelay()

    // 캡차 감지
    await this.detectCaptcha(page)

    // 로그인 폼 입력
    await page.fill('input[name="userId"], input[name="username"], #userId', this.username)
    await page.fill('input[name="password"], input[name="passwd"], #password', this.password)
    await page.click('button[type="submit"], .btn_login, .login-btn')
    await this.randomDelay()

    // 로그인 결과 확인
    const currentUrl = page.url()
    if (currentUrl.includes('/login')) {
      const errorEl = await page.$('.error-message, .alert-danger, .login_error, .error_txt')
      const errorMsg = errorEl
        ? await errorEl.textContent()
        : '로그인 실패: 알 수 없는 오류'

      throw new Error(`로그인 실패: ${errorMsg}`)
    }

    // storageState 저장 (쿠키 재사용)
    await this.context!.storageState()
    this.isLoggedIn = true
    logger.info('오너클랜 로그인 성공')
  }

  async placeOrder(request: WholesaleOrderRequest): Promise<WholesaleOrderResult> {
    try {
      if (!this.isLoggedIn) {
        await this.login()
      }

      const page = this.page!
      const productUrl = `${OWNERCLAN_BASE_URL}/V2/Product/Detail/${request.sourceProductId}`

      // 상품 페이지 이동
      await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
      await this.randomDelay()

      // 품절 체크
      const soldoutEl = await page.$('.soldout, .sold_out, .btn_soldout, [class*="품절"]')
      if (soldoutEl) {
        logger.info('상품 품절 감지', { sourceProductId: request.sourceProductId })
        return {
          success: false,
          errorMessage: '품절된 상품입니다',
          screenshotPath: await this.takeScreenshot(page, 'soldout'),
        }
      }

      // 옵션 선택
      if (request.productOptions) {
        for (const [optionName, optionValue] of Object.entries(request.productOptions)) {
          await page.selectOption(
            `select[name="${optionName}"], .option_select`,
            { label: optionValue },
          )
          await this.randomDelay()
        }
      }

      // 수량 입력
      await page.fill(
        'input[name="quantity"], input[name="qty"], .quantity_input',
        String(request.quantity),
      )

      // 구매하기 클릭
      await page.click('.btn_buy, .btn_order, button.buy, [class*="구매"]')
      await this.randomDelay()

      // 배송지 입력
      await page.fill(
        'input[name="receiverName"], input[name="name"], .receiver_name',
        request.shippingAddress.name,
      )
      await page.fill(
        'input[name="receiverPhone"], input[name="phone"], .receiver_phone',
        request.shippingAddress.phone,
      )
      await page.fill(
        'input[name="receiverAddress"], input[name="address"], .receiver_address',
        request.shippingAddress.address,
      )
      await page.fill(
        'input[name="receiverZipCode"], input[name="zipCode"], .receiver_zipcode',
        request.shippingAddress.zipCode,
      )

      // 주문 확인 클릭
      await page.click('.btn_confirm, .btn_submit, button[type="submit"]')
      await this.randomDelay()

      // 주문번호 추출
      const orderConfirmEl = await page.waitForSelector(
        '.order_number, .order_id, .order-complete, [class*="주문번호"]',
        { timeout: 10000 },
      )
      const orderText = await orderConfirmEl.textContent()
      const orderIdMatch = orderText?.match(/OC-[\w-]+/) ?? orderText?.match(/\d{8,}/)
      const wholesaleOrderId = orderIdMatch?.[0] ?? orderText?.trim() ?? ''

      // 로그에 개인정보 기록 금지 (전화번호 등)
      logger.info('주문 완료', {
        sourceProductId: request.sourceProductId,
        wholesaleOrderId,
        quantity: request.quantity,
      })

      return {
        success: true,
        wholesaleOrderId,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '주문 처리 중 알 수 없는 오류'
      logger.error('주문 실패', {
        sourceProductId: request.sourceProductId,
        error: errorMessage,
      })

      return {
        success: false,
        errorMessage,
        screenshotPath: await this.takeScreenshot(this.page!, 'order-error'),
      }
    }
  }

  async getTrackingNumber(wholesaleOrderId: string): Promise<string | null> {
    try {
      if (!this.isLoggedIn) {
        await this.login()
      }

      const page = this.page!
      const orderDetailUrl = `${ORDER_HISTORY_URL}/${wholesaleOrderId}`

      await page.goto(orderDetailUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
      await this.randomDelay()

      const trackingEl = await page.waitForSelector(
        '.tracking_number, .invoice_number, .delivery_number, [class*="운송장"]',
        { timeout: 5000 },
      )

      const trackingNumber = await trackingEl.textContent()
      const cleaned = trackingNumber?.replace(/[^0-9]/g, '') ?? null

      if (cleaned) {
        logger.info('운송장 조회 성공', { wholesaleOrderId })
      }

      return cleaned || null
    } catch {
      logger.info('운송장 미확인', { wholesaleOrderId })
      return null
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
      this.context = null
      this.page = null
      this.isLoggedIn = false
    }
  }

  // ----- Internal Helpers -----

  buildUniqueKey(wholesaleOrderId: string): string {
    return `ownerclan-order:${wholesaleOrderId}`
  }

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

  private async randomDelay(): Promise<void> {
    const delay = this.minDelayMs + Math.random() * (this.maxDelayMs - this.minDelayMs)
    await new Promise(resolve => setTimeout(resolve, delay))
  }

  private async detectCaptcha(page: Page): Promise<void> {
    const captchaEl = await page.$('.captcha, .recaptcha, #captcha, [class*="captcha"]')
    if (captchaEl) {
      throw new Error('캡차 감지: 자동 주문을 진행할 수 없습니다')
    }
  }

  private async takeScreenshot(page: Page, prefix: string): Promise<string> {
    try {
      const timestamp = Date.now()
      const path = `screenshots/${prefix}-${timestamp}.png`
      await page.screenshot({ path, fullPage: true })
      return path
    } catch {
      logger.warn('스크린샷 촬영 실패')
      return ''
    }
  }
}
