// =============================================
// 상품 등록 워커 단위 테스트 — exposure_blocked 경로 중심
//
// 테스트 전략:
//   BullMQ Worker 생성자를 Mock하여 프로세서 함수를 캡처 후 직접 호출.
//   노출 가능성 점수 필터(exposure_blocked)가 올바르게 동작하는지 검증.
// =============================================

import type { Job } from 'bullmq'
import type { RegistrationJobData } from '../queues'

// =============================================
// bullmq Mock — Worker 프로세서 캡처
// (mock 접두어 변수 → Jest 호이스팅 예외 적용)
// =============================================

let mockCapturedProcessor: ((job: Job<RegistrationJobData>) => Promise<unknown>) | null = null

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(
    (_queueName: string, processor: (job: Job<RegistrationJobData>) => Promise<unknown>) => {
      // 프로세서 함수를 모듈 외부에서 참조할 수 있도록 캡처
      mockCapturedProcessor = processor
      return { on: jest.fn() }
    },
  ),
  // queues.ts가 Queue를 사용하므로 함께 mock
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    addBulk: jest.fn(),
    close: jest.fn(),
  })),
}))

// =============================================
// 의존성 Mock
// =============================================

jest.mock('@smartstore/db', () => ({
  prisma: {
    // 트랜잭션: 인자로 받은 Promise 배열을 모두 실행
    $transaction: jest.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
    jobLog: {
      create: jest.fn().mockResolvedValue({ id: 'log-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    product: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'prod-1',
        name: '공구 드라이버 세트 10종',
        status: 'pending',
        wholesalePrice: 10000,
        shippingFee: 2500,
        naverFeeRate: 0.05,
        targetMarginRate: 0.30,
        category: '공구/철물',
        naverCategoryId: 'naver-cat-1',
        images: ['https://example.com/img.jpg'],
        description: '공구 드라이버 세트 설명',
        stockQuantity: 100,
        accountId: 'default',
        uniqueKey: 'wholesale:domaegguk:prod-1',
      }),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    competitorPrice: {
      count: jest.fn().mockResolvedValue(0),
    },
  },
}))

jest.mock('@smartstore/shared', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
  config: {
    redis: { host: 'localhost', port: 6379, password: undefined },
    system: { nodeEnv: 'test' },
  },
}))

jest.mock('@smartstore/core', () => ({
  // 모든 가드 통과 → exposure_blocked에 집중
  calculateWholesalePrice: jest.fn().mockReturnValue({
    salePrice: 15000,
    marginRate: 0.30,
    cost: 10500,
  }),
  calculateProductScore: jest.fn().mockReturnValue({
    totalScore: 80, // minScore(60) 이상 → 통과
    breakdown: {},
  }),
  isCategoryAllowed: jest.fn().mockReturnValue(true),
  isCategoryAllowedForSellerType: jest.fn().mockReturnValue(true),
  getAccountStrategy: jest.fn().mockReturnValue({
    minScore: 60,
    minMarginRate: 0.20,
    maxCompetitors: 10,
  }),
  classifyProductType: jest.fn().mockReturnValue('growth'),
  isPortfolioRatioExceeded: jest.fn().mockReturnValue(false),
  getPortfolioPhase: jest.fn().mockReturnValue(3),
  assertProductUniqueKey: jest.fn(),
  // 노출 점수 mock — 기본값 45 (EXPOSURE_SCORE_THRESHOLD 60 미달 → exposure_blocked)
  calculateExposureScore: jest.fn().mockReturnValue(45),
  EXPOSURE_SCORE_THRESHOLD: 60,
  // 경쟁가 비교 개선 — 키워드 추출 + 이상치 필터
  extractSearchKeyword: jest.fn().mockImplementation((name: string) => name),
  filterCompetitorPrices: jest.fn().mockImplementation((prices: Array<{ price: number }>) => ({
    filtered: prices,
    removed: [],
    median: prices.length > 0 ? prices[0].price : 0,
  })),
  // Phase C 신규 모듈
  validateTieredMargin: jest.fn(),
  getMinMarginRate: jest.fn().mockReturnValue(0.15),
  isNicheProduct: jest.fn().mockReturnValue(false),
  calculateNicheScore: jest.fn().mockReturnValue(0),
  getOriginMarginAdjustment: jest.fn().mockReturnValue(0),
  classifyNicheCategory: jest.fn().mockReturnValue('기타'),
  isProductAllowedForAccount: jest.fn().mockReturnValue({ allowed: true, category: '드릴비트', group: '전동공구 소모품' }),
  optimizeProductTitle: jest.fn().mockImplementation(({ originalName }: { originalName: string }) => originalName),
  generateSearchTags: jest.fn().mockReturnValue(['공구', '드라이버', '세트']),
  shouldRetry: jest.fn().mockReturnValue(false),
  calculateRetryPrice: jest.fn().mockReturnValue(null),
  getMaxRetryCount: jest.fn().mockReturnValue(0),
}))

jest.mock('@smartstore/integrations', () => ({
  registerProductToNaver: jest.fn().mockResolvedValue({
    success: true,
    originProductNo: 987654,
  }),
}))

jest.mock('@smartstore/adapters', () => ({
  notificationAdapter: {
    send: jest.fn().mockResolvedValue(undefined),
  },
}))

// 경쟁 상품 많음 — 기본 DB 조회(0) 후 실시간 1건 반환 → maxCompetitors(10) 이하 → 통과
jest.mock('./competitor-limiter', () => ({
  fetchCompetitorCountLimited: jest.fn().mockResolvedValue(1),
}))

// naverShoppingCrawler.fetchTop20Products → 고경쟁 데이터 (exposure 점수 낮게)
jest.mock('@smartstore/crawlers', () => ({
  naverShoppingCrawler: {
    fetchTop20Products: jest.fn().mockResolvedValue({
      adCount: 10,        // 0점 구간
      avgReview: 1500,    // 0점 구간
      brandCountTop10: 8, // 0점 구간
      avgTopPrice: 12000,
    }),
    // 가격 경쟁력 검사 — 기본: 경쟁력 있음 (우리가격보다 높은 가격 반환)
    fetchCompetitorPrices: jest.fn().mockResolvedValue([
      { price: 20000, name: '경쟁상품A' },
    ]),
  },
}))

// 설정 캐시 — 기본값 'individual' (개인 셀러)
jest.mock('../settings-cache', () => ({
  getSetting: jest.fn().mockReturnValue('individual'),
}))

// 자격증명 게이트 — 항상 통과
jest.mock('../credential-gate', () => ({
  checkCredentialGate: jest.fn().mockResolvedValue({ passed: true, missing: [] }),
  gateSkipResult: jest.fn(),
}))

// queues.ts 직접 대체 (Queue 인스턴스 생성 방지)
jest.mock('../queues', () => ({
  QUEUE_NAMES: { PRODUCT_REGISTRATION: 'product-registration' },
  registrationQueue: {
    add: jest.fn().mockResolvedValue({}),
    close: jest.fn().mockResolvedValue(undefined),
  },
  blogPostingQueue: {
    add: jest.fn().mockResolvedValue({}),
    close: jest.fn().mockResolvedValue(undefined),
  },
}))

// =============================================
// 헬퍼
// =============================================

/** 테스트용 Job 객체 생성 */
function makeJob(productId: string, jobId = 'job-1'): Job<RegistrationJobData> {
  return {
    id: jobId,
    data: { productId } as RegistrationJobData,
  } as Job<RegistrationJobData>
}

// =============================================
// 테스트
// =============================================

import { createRegistrationWorker } from './registration.job'

describe('createRegistrationWorker — exposure_blocked 경로', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCapturedProcessor = null
    process.env['ACCOUNT_ID'] = 'default'
  })

  // ---- 기본 exposure_blocked 동작 ----

  it('노출 점수 45 (< 60) → { skipped: true, reason: "exposure_blocked", exposureScore: 45 }', async () => {
    createRegistrationWorker()
    expect(mockCapturedProcessor).not.toBeNull()

    const result = await mockCapturedProcessor!(makeJob('prod-1'))

    expect(result).toEqual({
      skipped: true,
      reason: 'exposure_blocked',
      exposureScore: 45,
    })
  })

  // ---- fetchTop20Products 호출 검증 ----

  it('fetchTop20Products가 상품명으로 호출됨', async () => {
    const { naverShoppingCrawler } = jest.requireMock('@smartstore/crawlers') as {
      naverShoppingCrawler: { fetchTop20Products: jest.Mock }
    }

    createRegistrationWorker()
    await mockCapturedProcessor!(makeJob('prod-1', 'job-2'))

    expect(naverShoppingCrawler.fetchTop20Products).toHaveBeenCalledWith('공구 드라이버 세트 10종')
    expect(naverShoppingCrawler.fetchTop20Products).toHaveBeenCalledTimes(1)
  })

  // ---- calculateExposureScore 입력값 검증 ----

  it('calculateExposureScore에 올바른 입력값이 전달됨', async () => {
    const { calculateExposureScore } = jest.requireMock('@smartstore/core') as {
      calculateExposureScore: jest.Mock
    }

    createRegistrationWorker()
    await mockCapturedProcessor!(makeJob('prod-1', 'job-3'))

    expect(calculateExposureScore).toHaveBeenCalledWith({
      adCount: 10,
      avgReview: 1500,
      brandCountTop10: 8,
      avgTopPrice: 12000,
      myPrice: 15000, // calculateWholesalePrice mock → salePrice: 15000
    })
  })

  // ---- jobLog 업데이트 검증 ----

  it('exposure_blocked 시 jobLog가 completed + exposure_blocked 결과로 업데이트됨', async () => {
    const { prisma } = jest.requireMock('@smartstore/db') as {
      prisma: { jobLog: { update: jest.Mock } }
    }

    createRegistrationWorker()
    await mockCapturedProcessor!(makeJob('prod-1', 'job-4'))

    expect(prisma.jobLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'completed',
          result: expect.objectContaining({
            skipped: true,
            reason: 'exposure_blocked',
            exposureScore: 45,
          }),
        }),
      }),
    )
  })

  // ---- 등록 함수 미호출 검증 ----

  it('exposure_blocked 시 registerProductToNaver 호출 없음', async () => {
    const { registerProductToNaver } = jest.requireMock('@smartstore/integrations') as {
      registerProductToNaver: jest.Mock
    }

    createRegistrationWorker()
    await mockCapturedProcessor!(makeJob('prod-1', 'job-5'))

    expect(registerProductToNaver).not.toHaveBeenCalled()
  })

  // ---- fail-open 동작 (top20 = null) ----

  it('fetchTop20Products → null 반환 시 fail-open (등록 진행)', async () => {
    // null 반환 = 타임아웃 또는 오류 상황 시뮬레이션
    const { naverShoppingCrawler } = jest.requireMock('@smartstore/crawlers') as {
      naverShoppingCrawler: { fetchTop20Products: jest.Mock }
    }
    naverShoppingCrawler.fetchTop20Products.mockResolvedValueOnce(null)

    const { registerProductToNaver } = jest.requireMock('@smartstore/integrations') as {
      registerProductToNaver: jest.Mock
    }

    createRegistrationWorker()
    await mockCapturedProcessor!(makeJob('prod-1', 'job-6'))

    // null이면 노출 점수 체크 건너뜀 → 등록 시도
    expect(registerProductToNaver).toHaveBeenCalled()
  })

  // ---- 노출 점수 ≥ 60 → 등록 진행 ----

  it('노출 점수 80 (≥ 60) → exposure 통과 → 등록 시도', async () => {
    const { calculateExposureScore } = jest.requireMock('@smartstore/core') as {
      calculateExposureScore: jest.Mock
    }
    calculateExposureScore.mockReturnValueOnce(80) // 통과

    const { registerProductToNaver } = jest.requireMock('@smartstore/integrations') as {
      registerProductToNaver: jest.Mock
    }

    createRegistrationWorker()
    await mockCapturedProcessor!(makeJob('prod-1', 'job-7'))

    // 노출 통과 → 등록 실행
    expect(registerProductToNaver).toHaveBeenCalled()
  })
})
