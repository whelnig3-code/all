// =============================================
// 이미지 파이프라인 통합 테스트
// runImagePipeline — 각 단계 실패 시 degrade 검증
// =============================================

import * as ocrModule from '@smartstore/core'
import * as translateModule from '@smartstore/core'
import * as integrationsModule from '@smartstore/integrations'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { EventEmitter } from 'events'

// 외부 의존성 mock — jest.requireActual 사용 금지 (NaverCommerceApiClient 초기화 에러 방지)
jest.mock('@smartstore/core', () => ({
  ocrExtract: jest.fn(),
  translateToKorean: jest.fn(),
  sanitizeMarketingPhrases: jest.fn(),
  redesignImage: jest.fn(),
  // registration.job에서 사용하는 나머지 export
  calculateWholesalePrice: jest.fn().mockReturnValue({ salePrice: 15000, marginRate: 0.30, cost: 10500 }),
  calculateProductScore: jest.fn().mockReturnValue({ totalScore: 80, breakdown: {} }),
  isCategoryAllowed: jest.fn().mockReturnValue(true),
  getAccountStrategy: jest.fn().mockReturnValue({ minScore: 60, minMarginRate: 0.20, maxCompetitors: 10 }),
  classifyProductType: jest.fn().mockReturnValue('growth'),
  isPortfolioRatioExceeded: jest.fn().mockReturnValue(false),
  getPortfolioPhase: jest.fn().mockReturnValue(3),
  assertProductUniqueKey: jest.fn(),
  calculateExposureScore: jest.fn().mockReturnValue(80),
  EXPOSURE_SCORE_THRESHOLD: 60,
}))

jest.mock('@smartstore/integrations', () => ({
  uploadProductImages: jest.fn(),
  registerProductToNaver: jest.fn().mockResolvedValue({ success: true, originProductNo: 12345 }),
  naverCommerceApi: { approveCancel: jest.fn(), rejectCancel: jest.fn(), approveReturn: jest.fn(), rejectReturn: jest.fn() },
}))

jest.mock('@smartstore/shared', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  config: { redis: { host: 'localhost', port: 6379, password: undefined }, system: { nodeEnv: 'test' } },
}))

jest.mock('@smartstore/adapters', () => ({
  notificationAdapter: { send: jest.fn().mockResolvedValue(undefined) },
}))

jest.mock('@smartstore/crawlers', () => ({
  naverShoppingCrawler: { fetchTop20Products: jest.fn().mockResolvedValue(null) },
}))

jest.mock('@smartstore/db', () => ({
  prisma: {
    $transaction: jest.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
    jobLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }), update: jest.fn().mockResolvedValue({}) },
    product: {
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    competitorPrice: { count: jest.fn().mockResolvedValue(0) },
  },
}))

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn() })),
  Queue: jest.fn().mockImplementation(() => ({ add: jest.fn(), addBulk: jest.fn(), close: jest.fn() })),
}))

jest.mock('../queues', () => ({
  QUEUE_NAMES: { PRODUCT_REGISTRATION: 'product-registration' },
  blogPostingQueue: { add: jest.fn().mockResolvedValue({}), close: jest.fn() },
}))

jest.mock('../jobs/competitor-limiter', () => ({
  fetchCompetitorCountLimited: jest.fn().mockResolvedValue(1),
}))

// 자격증명 게이트 — 항상 통과
jest.mock('../credential-gate', () => ({
  checkCredentialGate: jest.fn().mockResolvedValue({ passed: true, missing: [] }),
  gateSkipResult: jest.fn(),
}))

import { runImagePipeline, buildDetailHtml } from '../jobs/registration.job'

jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

// 더미 로거
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

const PRODUCT_ID = 'test-product-001'
const ORIGINAL_URLS = [
  'https://example.com/image1.jpg',
  'https://example.com/image2.jpg',
]

describe('runImagePipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // 기본 환경변수
    process.env['IMAGE_OUTPUT_DIR'] = '/tmp/test-images'

    // fs.mkdirSync mock
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined)

    // 이미지 다운로드 mock (axios.get → stream, fs.createWriteStream → EventEmitter)
    jest.spyOn(fs, 'createWriteStream').mockImplementation(() => {
      const emitter = new EventEmitter()
      // pipe가 호출되면 즉시 finish 이벤트 발생
      setTimeout(() => emitter.emit('finish'), 5)
      return emitter as unknown as fs.WriteStream
    })
    const mockStream = {
      pipe: jest.fn().mockReturnValue(undefined),
    }
    mockedAxios.get.mockResolvedValue({ data: mockStream })

    // 기본 성공 mock
    ;(ocrModule.ocrExtract as jest.Mock).mockResolvedValue(['中文文字', 'English text'])
    ;(translateModule.translateToKorean as jest.Mock).mockResolvedValue(['중국어 문자', '영어 텍스트'])
    ;(ocrModule.sanitizeMarketingPhrases as jest.Mock).mockReturnValue(['특징 1', '특징 2', '특징 3'])
    ;(ocrModule.redesignImage as jest.Mock).mockResolvedValue('/tmp/test-images/test-product-001/cleaned_0.jpg')
    ;(integrationsModule.uploadProductImages as jest.Mock).mockResolvedValue([
      'https://naver.com/image1.jpg',
      'https://naver.com/image2.jpg',
    ])
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('전체 성공 → cleaned 이미지 URL이 결과에 포함', async () => {
    const result = await runImagePipeline(
      PRODUCT_ID,
      ORIGINAL_URLS,
      '테스트 상품명',
      mockLogger as any
    )

    expect(result).toContain('https://naver.com/image1.jpg')
    expect(integrationsModule.uploadProductImages).toHaveBeenCalled()
  })

  it('OCR 실패 → raw 이미지 경로로 계속 진행 (degrade)', async () => {
    ;(ocrModule.ocrExtract as jest.Mock).mockRejectedValue(new Error('PaddleOCR 실패'))

    const result = await runImagePipeline(
      PRODUCT_ID,
      ORIGINAL_URLS,
      '테스트 상품명',
      mockLogger as any
    )

    // 등록 중단 금지 — 결과는 반드시 배열
    expect(Array.isArray(result)).toBe(true)
    // warn 로그 기록됨
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('ocr_failed'),
      expect.any(Object)
    )
  })

  it('redesign 실패 → raw 이미지 경로 사용 (degrade)', async () => {
    ;(ocrModule.redesignImage as jest.Mock).mockResolvedValue(null) // redesign 실패

    const result = await runImagePipeline(
      PRODUCT_ID,
      ORIGINAL_URLS,
      '테스트 상품명',
      mockLogger as any
    )

    // 등록 중단 금지 — 결과 반환
    expect(Array.isArray(result)).toBe(true)
    // redesign_failed 경고 기록
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('redesign_failed'),
      expect.any(Object)
    )
  })

  it('upload 실패 → 원본 URL 사용 (degrade)', async () => {
    ;(integrationsModule.uploadProductImages as jest.Mock).mockResolvedValue([]) // 업로드 실패

    const result = await runImagePipeline(
      PRODUCT_ID,
      ORIGINAL_URLS,
      '테스트 상품명',
      mockLogger as any
    )

    // 원본 URL로 fallback
    expect(result).toEqual(ORIGINAL_URLS)
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('원본 URL'),
      expect.any(Object)
    )
  })

  it('이미지 URL 없음 → 빈 배열 반환', async () => {
    const result = await runImagePipeline(
      PRODUCT_ID,
      [],
      '테스트 상품명',
      mockLogger as any
    )

    expect(result).toEqual([])
    expect(ocrModule.ocrExtract).not.toHaveBeenCalled()
  })

  it('이미지 4개 이상 → 최대 3장만 처리', async () => {
    const manyUrls = [
      'https://example.com/img1.jpg',
      'https://example.com/img2.jpg',
      'https://example.com/img3.jpg',
      'https://example.com/img4.jpg',
    ]

    await runImagePipeline(PRODUCT_ID, manyUrls, '테스트 상품명', mockLogger as any)

    // OCR은 최대 3번만 호출
    expect(ocrModule.ocrExtract).toHaveBeenCalledTimes(3)
  })
})

describe('buildDetailHtml', () => {
  it('이미지 URL을 img 태그로 상단에 배치', () => {
    const html = buildDetailHtml(
      ['https://naver.com/img1.jpg', 'https://naver.com/img2.jpg'],
      '<p>기존 설명</p>'
    )

    expect(html).toContain('<img src="https://naver.com/img1.jpg"')
    expect(html).toContain('<img src="https://naver.com/img2.jpg"')
    expect(html).toContain('<p>기존 설명</p>')
    // 이미지가 설명보다 앞에 위치
    expect(html.indexOf('img1.jpg')).toBeLessThan(html.indexOf('기존 설명'))
  })

  it('이미지 없음 → 원본 설명 반환', () => {
    const html = buildDetailHtml([], '<p>기존 설명</p>')
    expect(html).toBe('<p>기존 설명</p>')
  })
})
