// =============================================
// 오너클랜 자동 주문 크롤러 테스트
// =============================================

import { OwnerclanOrderer } from './orderer'
import type { WholesaleOrderRequest } from './order-types'

// ----- Playwright Mock -----

const mockFill = jest.fn()
const mockClick = jest.fn()
const mockGoto = jest.fn()
const mockWaitForSelector = jest.fn()
const mockTextContent = jest.fn()
const mockInnerText = jest.fn()
const mockScreenshot = jest.fn()
const mockLocator = jest.fn()
const mock$ = jest.fn()
const mock$$ = jest.fn()
const mockWaitForURL = jest.fn()
const mockUrl = jest.fn().mockReturnValue('https://ownerclan.com/mypage')
const mockSelectOption = jest.fn()
const mockEvaluate = jest.fn()

const mockPage = {
  fill: mockFill,
  click: mockClick,
  goto: mockGoto,
  waitForSelector: mockWaitForSelector,
  textContent: mockTextContent,
  innerText: mockInnerText,
  screenshot: mockScreenshot,
  locator: mockLocator,
  $: mock$,
  $$: mock$$,
  waitForURL: mockWaitForURL,
  url: mockUrl,
  selectOption: mockSelectOption,
  evaluate: mockEvaluate,
}

const mockStorageState = jest.fn().mockResolvedValue({})
const mockNewPage = jest.fn().mockResolvedValue(mockPage)
const mockContextClose = jest.fn()

const mockContext = {
  newPage: mockNewPage,
  storageState: mockStorageState,
  close: mockContextClose,
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

// ----- Test Helpers -----

function makeOrderRequest(overrides?: Partial<WholesaleOrderRequest>): WholesaleOrderRequest {
  return {
    sourceProductId: '12345',
    quantity: 2,
    shippingAddress: {
      name: '홍길동',
      phone: '010-1234-5678',
      address: '서울시 강남구 테헤란로 123',
      zipCode: '06234',
    },
    ...overrides,
  }
}

// ----- Tests -----

describe('OwnerclanOrderer', () => {
  let orderer: OwnerclanOrderer

  beforeEach(() => {
    jest.clearAllMocks()
    orderer = new OwnerclanOrderer('testuser', 'testpass', {
      headless: true,
      minDelayMs: 0,
      maxDelayMs: 0,
    })

    // 기본 성공 시나리오 설정
    mockUrl.mockReturnValue('https://ownerclan.com/mypage')
    mockWaitForSelector.mockResolvedValue(null)
    mock$.mockResolvedValue(null)
  })

  afterEach(async () => {
    await orderer.close()
  })

  // 1. 로그인 성공
  it('로그인 성공 — fill, click 호출 확인', async () => {
    await orderer.login()

    expect(mockLaunch).toHaveBeenCalledWith({ headless: true })
    expect(mockGoto).toHaveBeenCalledWith(
      expect.stringContaining('ownerclan.com'),
      expect.any(Object),
    )
    expect(mockFill).toHaveBeenCalledWith(
      expect.any(String),
      'testuser',
    )
    expect(mockFill).toHaveBeenCalledWith(
      expect.any(String),
      'testpass',
    )
    expect(mockClick).toHaveBeenCalled()
  })

  // 2. 로그인 실패
  it('로그인 실패 — 에러 throw', async () => {
    mockUrl.mockReturnValue('https://ownerclan.com/login')
    mock$.mockImplementation(async (selector: string) => {
      if (selector.includes('error') || selector.includes('alert')) {
        return { textContent: () => Promise.resolve('아이디 또는 비밀번호가 일치하지 않습니다') }
      }
      return null
    })

    await expect(orderer.login()).rejects.toThrow()
  })

  // 3. 주문 성공
  it('주문 성공 — wholesaleOrderId 반환', async () => {
    // login 성공 설정
    mockUrl.mockReturnValue('https://ownerclan.com/mypage')

    // 주문 완료 후 주문번호 추출
    mockTextContent.mockResolvedValue('주문번호: OC-20260309-00123')
    mockWaitForSelector.mockResolvedValue({
      textContent: () => Promise.resolve('주문번호: OC-20260309-00123'),
    })

    const result = await orderer.placeOrder(makeOrderRequest())

    expect(result.success).toBe(true)
    expect(result.wholesaleOrderId).toBeDefined()
    expect(result.wholesaleOrderId).toContain('OC-')
  })

  // 4. 주문 실패 (품절)
  it('주문 실패 (품절) — success: false와 에러 메시지', async () => {
    mockUrl.mockReturnValue('https://ownerclan.com/mypage')

    // 품절 감지
    mock$.mockImplementation(async (selector: string) => {
      if (selector.includes('soldout') || selector.includes('sold_out') || selector.includes('품절')) {
        return { textContent: () => Promise.resolve('품절') }
      }
      return null
    })

    const result = await orderer.placeOrder(makeOrderRequest())

    expect(result.success).toBe(false)
    expect(result.errorMessage).toBeDefined()
    expect(result.errorMessage).toContain('품절')
  })

  // 5. 캡차 감지
  it('캡차 감지 시 에러 throw', async () => {
    mock$.mockImplementation(async (selector: string) => {
      if (selector.includes('captcha') || selector.includes('recaptcha')) {
        return { textContent: () => Promise.resolve('captcha') }
      }
      return null
    })

    await expect(orderer.login()).rejects.toThrow(/캡차|captcha/i)
  })

  // 6. 운송장 조회 성공
  it('운송장 조회 성공 — 운송장 번호 반환', async () => {
    mockUrl.mockReturnValue('https://ownerclan.com/mypage')
    mockTextContent.mockResolvedValue('1234567890')
    mockWaitForSelector.mockResolvedValue({
      textContent: () => Promise.resolve('1234567890'),
    })

    const trackingNumber = await orderer.getTrackingNumber('OC-20260309-00123')

    expect(trackingNumber).toBe('1234567890')
  })

  // 7. 운송장 미확인
  it('운송장 미확인 — null 반환', async () => {
    mockUrl.mockReturnValue('https://ownerclan.com/mypage')
    mockWaitForSelector.mockRejectedValue(new Error('Timeout'))

    const trackingNumber = await orderer.getTrackingNumber('OC-20260309-00123')

    expect(trackingNumber).toBeNull()
  })

  // 8. 쿠키 재사용
  it('두 번째 login 시 새 브라우저 안 만듦', async () => {
    await orderer.login()
    expect(mockLaunch).toHaveBeenCalledTimes(1)

    await orderer.login()
    expect(mockLaunch).toHaveBeenCalledTimes(1)
  })

  // 9. close 호출 시 브라우저 정리
  it('close 호출 시 브라우저 정리', async () => {
    await orderer.login()
    await orderer.close()

    expect(mockBrowserClose).toHaveBeenCalledTimes(1)
  })

  // 10. buildUniqueKey 형식
  it('buildUniqueKey가 "ownerclan-order:{id}" 형식 반환', () => {
    expect(orderer.buildUniqueKey('OC-12345')).toBe('ownerclan-order:OC-12345')
    expect(orderer.buildUniqueKey('OC-99999')).toBe('ownerclan-order:OC-99999')
  })
})
