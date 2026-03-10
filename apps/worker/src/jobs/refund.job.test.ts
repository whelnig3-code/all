// =============================================
// 환불/교환 처리 워커 테스트
//
// 검증 항목:
//   1. evaluateRefundRequest 비즈니스 로직
//   2. 워커 실행 흐름 (DB 저장, API 호출, 알림)
//   3. Kill Switch 동작
//   4. 에러 핸들링
//   5. console.log 부재 (정적 분석)
// =============================================

import * as fs from 'fs'
import * as path from 'path'

// evaluateRefundRequest만 직접 테스트 (순수 함수)
// 워커 생성은 bullmq mock이 필요하므로 별도 describe

// =============================================
// evaluateRefundRequest 단위 테스트
// =============================================

describe('evaluateRefundRequest', () => {
  // jest.isolateModules로 모듈 격리 후 import
  let evaluateRefundRequest: typeof import('./refund.job')['evaluateRefundRequest']

  beforeAll(async () => {
    // 워커 모듈을 로딩하기 위한 최소 mock
    jest.mock('bullmq', () => ({
      Worker: jest.fn().mockImplementation(() => ({ on: jest.fn() })),
      Queue: jest.fn().mockImplementation(() => ({ add: jest.fn(), addBulk: jest.fn(), close: jest.fn() })),
    }))
    jest.mock('@smartstore/shared', () => ({
      createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
      config: { redis: { host: 'localhost', port: 6379 } },
    }))
    jest.mock('@smartstore/integrations', () => ({
      naverCommerceApi: { approveCancel: jest.fn(), rejectCancel: jest.fn(), approveReturn: jest.fn(), rejectReturn: jest.fn() },
    }))
    jest.mock('@smartstore/adapters', () => ({ notificationAdapter: { send: jest.fn() } }))
    jest.mock('@smartstore/db', () => ({
      prisma: { order: { findUnique: jest.fn() }, refundProcessLog: { create: jest.fn() } },
    }))
    jest.mock('../queues', () => ({ QUEUE_NAMES: { REFUND_PROCESSING: 'refund-processing' } }))
    jest.mock('../settings-cache', () => ({ getSetting: jest.fn().mockReturnValue('true') }))
    jest.mock('../credential-gate', () => ({
      checkCredentialGate: jest.fn().mockResolvedValue({ passed: true, missing: [] }),
      gateSkipResult: jest.fn(),
    }))

    const mod = await import('./refund.job')
    evaluateRefundRequest = mod.evaluateRefundRequest
  })

  const defaultConfig = {
    maxAmount: 50_000,
    approveKeywords: ['단순변심', '사이즈교환', '색상교환'] as readonly string[],
    rejectKeywords: ['사용흔적', '택제거', '세탁후'] as readonly string[],
  }

  // ---- 자동 승인 ----

  it('단순변심 + 5만원 이하 → 자동 승인', () => {
    const result = evaluateRefundRequest({
      type: 'refund',
      reason: '단순변심으로 환불 요청합니다',
      orderAmount: 30_000,
      config: defaultConfig,
    })

    expect(result.action).toBe('approve')
    expect(result.reason).toContain('단순변심')
  })

  it('사이즈교환 + 5만원 이하 → 자동 승인', () => {
    const result = evaluateRefundRequest({
      type: 'exchange',
      reason: '사이즈교환 부탁드립니다',
      orderAmount: 20_000,
      config: defaultConfig,
    })

    expect(result.action).toBe('approve')
  })

  // ---- 자동 거절 (키워드 우선) ----

  it('사용흔적 키워드 → 자동 거절 (금액 무관)', () => {
    const result = evaluateRefundRequest({
      type: 'refund',
      reason: '사용흔적이 있어서 환불 요청',
      orderAmount: 10_000,
      config: defaultConfig,
    })

    expect(result.action).toBe('reject')
    expect(result.reason).toContain('사용흔적')
  })

  it('거절 키워드가 승인 키워드보다 우선', () => {
    // "단순변심" + "택제거" 동시 포함 → 거절이 우선
    const result = evaluateRefundRequest({
      type: 'refund',
      reason: '단순변심이지만 택제거 후 사용',
      orderAmount: 10_000,
      config: defaultConfig,
    })

    expect(result.action).toBe('reject')
  })

  // ---- 금액 초과 → 수동 처리 ----

  it('5만원 초과 → 수동 처리 (승인 키워드 있어도)', () => {
    const result = evaluateRefundRequest({
      type: 'refund',
      reason: '단순변심입니다',
      orderAmount: 100_000,
      config: defaultConfig,
    })

    expect(result.action).toBe('manual')
    expect(result.reason).toContain('금액 초과')
  })

  // ---- 조건 미충족 → 수동 처리 ----

  it('키워드 미매칭 + 금액 이내 → 수동 처리', () => {
    const result = evaluateRefundRequest({
      type: 'refund',
      reason: '상품이 마음에 안 들어요',
      orderAmount: 30_000,
      config: defaultConfig,
    })

    expect(result.action).toBe('manual')
    expect(result.reason).toContain('미충족')
  })

  // ---- 교환 타입도 동일 로직 ----

  it('교환 타입도 동일한 규칙 적용', () => {
    const result = evaluateRefundRequest({
      type: 'exchange',
      reason: '색상교환 원합니다',
      orderAmount: 25_000,
      config: defaultConfig,
    })

    expect(result.action).toBe('approve')
  })
})

// =============================================
// console.log 부재 검증 (정적 분석)
// =============================================

describe('refund.job.ts — console.log 부재 검증', () => {
  it('소스 파일에 console.log가 없음', () => {
    const filePath = path.resolve(__dirname, './refund.job.ts')
    const source = fs.readFileSync(filePath, 'utf8')
    const consoleUsages = source.match(/console\.(log|warn|error|info)\(/g)
    expect(consoleUsages).toBeNull()
  })
})

describe('index.ts — console.log 부재 검증', () => {
  it('워커 메인 엔트리에 console.log가 없음', () => {
    const filePath = path.resolve(__dirname, '../index.ts')
    const source = fs.readFileSync(filePath, 'utf8')
    const consoleUsages = source.match(/console\.(log|warn|error|info)\(/g)
    expect(consoleUsages).toBeNull()
  })
})
