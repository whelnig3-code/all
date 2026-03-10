// =============================================
// 도매꾹 주문 자동화 테스트 (TDD — RED → GREEN)
// =============================================

import { DomaeggukOrderer } from './orderer'
import type { WholesaleOrderRequest } from '../wholesale-order-types'

// ---------- Playwright mock ----------

const mockFill = jest.fn()
const mockClick = jest.fn()
const mockGoto = jest.fn()
const mockUrl = jest.fn().mockReturnValue('https://domeggook.com/mypage')
const mockWaitForSelector = jest.fn()
const mockTextContent = jest.fn()
const mockScreenshot = jest.fn()
const mockSelectOption = jest.fn()
const mockLocatorCount = jest.fn().mockResolvedValue(0)
const mockLocator = jest.fn().mockReturnValue({ count: mockLocatorCount })
const mockInnerText = jest.fn()
const mock$eval = jest.fn()

const mockPage = {
  fill: mockFill,
  click: mockClick,
  goto: mockGoto,
  url: mockUrl,
  waitForSelector: mockWaitForSelector,
  textContent: mockTextContent,
  screenshot: mockScreenshot,
  selectOption: mockSelectOption,
  locator: mockLocator,
  innerText: mockInnerText,
  $eval: mock$eval,
}

const mockStorageState = jest.fn().mockResolvedValue({})
const mockNewPage = jest.fn().mockResolvedValue(mockPage)

const mockContext = {
  newPage: mockNewPage,
  storageState: mockStorageState,
}

const mockNewContext = jest.fn().mockResolvedValue(mockContext)
const mockBrowserClose = jest.fn()

const mockBrowser = {
  newContext: mockNewContext,
  close: mockBrowserClose,
}

const mockLaunch = jest.fn().mockResolvedValue(mockBrowser)

jest.mock('playwright', () => ({
  chromium: {
    launch: (...args: unknown[]) => mockLaunch(...args),
  },
}))

jest.mock('@smartstore/shared', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}))

// ---------- 테스트 헬퍼 ----------

function makeOrderRequest(overrides?: Partial<WholesaleOrderRequest>): WholesaleOrderRequest {
  return {
    sourceProductId: '12345',
    quantity: 2,
    shippingAddress: {
      name: '홍길동',
      phone: '010-1234-5678',
      address: '서울시 강남구 역삼동 123-45',
      zipCode: '06234',
    },
    ...overrides,
  }
}

// ---------- 테스트 ----------

describe('DomaeggukOrderer', () => {
  let orderer: DomaeggukOrderer

  beforeEach(() => {
    jest.clearAllMocks()
    mockUrl.mockReturnValue('https://domeggook.com/mypage')
    mockLocatorCount.mockResolvedValue(0)
    orderer = new DomaeggukOrderer('testuser', 'testpass', { headless: true, minDelayMs: 0, maxDelayMs: 0 })
  })

  afterEach(async () => {
    await orderer.close()
  })

  // ---- 1. 로그인 성공 ----

  it('로그인 성공 — fill, click 호출 확인', async () => {
    await orderer.login()

    expect(mockGoto).toHaveBeenCalledWith(
      'https://domeggook.com/login',
      expect.objectContaining({ waitUntil: 'domcontentloaded' }),
    )
    expect(mockFill).toHaveBeenCalledWith(
      expect.stringContaining('id'),
      'testuser',
    )
    expect(mockFill).toHaveBeenCalledWith(
      expect.stringContaining('pass'),
      'testpass',
    )
    expect(mockClick).toHaveBeenCalled()
  })

  // ---- 2. 로그인 실패 ----

  it('로그인 실패 — 잘못된 credentials로 에러 throw', async () => {
    mockUrl.mockReturnValue('https://domeggook.com/login')

    await expect(orderer.login()).rejects.toThrow('로그인 실패')
  })

  // ---- 3. 주문 성공 ----

  it('주문 성공 — placeOrder가 wholesaleOrderId 반환', async () => {
    mockTextContent.mockResolvedValue('주문번호: ORD-2026-001')
    mockWaitForSelector.mockResolvedValue({ textContent: jest.fn().mockResolvedValue('ORD-2026-001') })

    const request = makeOrderRequest()
    const result = await orderer.placeOrder(request)

    expect(result.success).toBe(true)
    expect(result.wholesaleOrderId).toBeDefined()
    expect(typeof result.wholesaleOrderId).toBe('string')
  })

  // ---- 4. 주문 실패 (품절) ----

  it('주문 실패 (품절) — 에러 메시지와 함께 success: false', async () => {
    mockClick.mockRejectedValueOnce(new Error('품절된 상품입니다'))

    const request = makeOrderRequest()
    const result = await orderer.placeOrder(request)

    expect(result.success).toBe(false)
    expect(result.errorMessage).toBeDefined()
  })

  // ---- 5. 캡차 감지 시 에러 throw ----

  it('캡차 감지 시 에러 throw', async () => {
    mockLocatorCount.mockResolvedValue(1)

    await expect(orderer.login()).rejects.toThrow('캡차')
  })

  // ---- 6. 운송장 조회 성공 ----

  it('운송장 조회 성공 — getTrackingNumber가 운송장 반환', async () => {
    mockTextContent.mockResolvedValue('1234567890')
    mockWaitForSelector.mockResolvedValue({
      textContent: jest.fn().mockResolvedValue('1234567890'),
    })

    const trackingNumber = await orderer.getTrackingNumber('ORD-2026-001')

    expect(trackingNumber).toBe('1234567890')
    expect(mockGoto).toHaveBeenCalledWith(
      expect.stringContaining('ORD-2026-001'),
      expect.any(Object),
    )
  })

  // ---- 7. 운송장 미확인 ----

  it('운송장 미확인 — null 반환', async () => {
    mockWaitForSelector.mockRejectedValue(new Error('Timeout'))

    const trackingNumber = await orderer.getTrackingNumber('ORD-2026-001')

    expect(trackingNumber).toBeNull()
  })

  // ---- 8. 쿠키 재사용 ----

  it('쿠키 재사용 — 두 번째 login 시 새 브라우저 안 만듦', async () => {
    await orderer.login()
    const firstLaunchCount = mockLaunch.mock.calls.length

    await orderer.login()
    expect(mockLaunch.mock.calls.length).toBe(firstLaunchCount)
  })

  // ---- 9. close 호출 시 브라우저 정리 ----

  it('close 호출 시 브라우저 정리', async () => {
    await orderer.login()
    await orderer.close()

    expect(mockBrowserClose).toHaveBeenCalled()
  })

  // ---- 10. buildUniqueKey 형식 확인 ----

  it('buildUniqueKey가 "domaegguk-order:{id}" 형식 반환', () => {
    expect(orderer.buildUniqueKey('ORD-001')).toBe('domaegguk-order:ORD-001')
    expect(orderer.buildUniqueKey('ORD-999')).toBe('domaegguk-order:ORD-999')
  })
})
