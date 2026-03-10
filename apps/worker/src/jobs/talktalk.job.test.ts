// =============================================
// 네이버 톡톡 자동 응답 워커 테스트 (Phase 4.1)
//
// 검증 항목:
//   1. Kill Switch 동작
//   2. Credential gate 실패
//   3. 주문 문의 카테고리 분류
//   4. 자동 응답 매칭 성공 → 발송
//   5. 자동 응답 매칭 실패 → 수동 대기
//   6. DB 대화 로그 저장
//   7. 긴급 + 부정 감정 → 알림 발송
//   8. executeAutoReply 실패 → autoReplied: false
//   9. analyzeInquiry 실패 → 기본값 사용
//   10. console.log 부재
// =============================================

import type { Job } from 'bullmq'
import type { TalkTalkJobData } from '../queues'

// =============================================
// BullMQ Mock — Worker 프로세서 캡처
// =============================================

let mockCapturedProcessor: ((job: Job<TalkTalkJobData>) => Promise<unknown>) | null = null

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(
    (_queueName: string, processor: (job: Job<TalkTalkJobData>) => Promise<unknown>) => {
      mockCapturedProcessor = processor
      return { on: jest.fn() }
    },
  ),
}))

// =============================================
// 의존성 Mock
// =============================================

const mockAnalyzeInquiry = jest.fn()
const mockHandleWebhook = jest.fn()
const mockExecuteAutoReply = jest.fn()

jest.mock('@smartstore/integrations', () => ({
  TalkTalkClient: jest.fn().mockImplementation(() => ({
    analyzeInquiry: (...args: unknown[]) => mockAnalyzeInquiry(...args),
    handleWebhook: (...args: unknown[]) => mockHandleWebhook(...args),
    executeAutoReply: (...args: unknown[]) => mockExecuteAutoReply(...args),
  })),
}))

const mockConversationCreate = jest.fn().mockResolvedValue({ id: 'conv-1' })

jest.mock('@smartstore/db', () => ({
  prisma: {
    talkTalkConversation: {
      create: (...args: unknown[]) => mockConversationCreate(...args),
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
    naver: {
      clientId: 'test-id',
      clientSecret: 'test-secret',
      shopId: 'test-shop',
    },
  },
}))

const mockNotificationSend = jest.fn().mockResolvedValue(undefined)

jest.mock('@smartstore/adapters', () => ({
  notificationAdapter: {
    send: (...args: unknown[]) => mockNotificationSend(...args),
  },
}))

jest.mock('../queues', () => ({
  QUEUE_NAMES: { TALKTALK_AUTOMATION: 'talktalk-automation' },
}))

const mockGateSkipResult = jest.fn().mockReturnValue({
  skipped: true,
  reason: 'credentials_not_configured',
  missingServices: ['naver_talktalk'],
})

jest.mock('../credential-gate', () => ({
  checkCredentialGate: jest.fn().mockResolvedValue({ passed: true, missing: [] }),
  gateSkipResult: (...args: unknown[]) => mockGateSkipResult(...args),
}))

jest.mock('../settings-cache', () => ({
  getSetting: jest.fn().mockReturnValue('true'),
}))

// =============================================
// 테스트
// =============================================

import { createTalkTalkWorker } from './talktalk.job'
import { getSetting } from '../settings-cache'
import { checkCredentialGate } from '../credential-gate'
import * as fs from 'fs'
import * as path from 'path'

/** 기본 분석 결과 */
const DEFAULT_ANALYSIS = {
  category: 'ORDER' as const,
  sentiment: 'NEUTRAL' as const,
  urgency: 'MEDIUM' as const,
  suggestedActions: ['주문 상태 확인'],
  entities: {},
}

/** 기본 웹훅 결과 — 매칭 성공 */
const WEBHOOK_MATCH = {
  shouldAutoReply: true,
  suggestedReply: '주문 확인 중입니다. 잠시만 기다려 주세요.',
  matchedTemplate: { templateId: 'tmpl-1', name: '주문 문의', trigger: '주문', message: '주문 확인 중입니다.', keywords: ['주문'], priority: 1, enabled: true },
}

/** 기본 웹훅 결과 — 매칭 없음 */
const WEBHOOK_NO_MATCH = {
  shouldAutoReply: false,
}

function makeTalkTalkJob(overrides: Partial<TalkTalkJobData> = {}): Job<TalkTalkJobData> {
  return {
    id: 'job-tt-1',
    data: {
      channelId: 'ch-1',
      customerId: 'cust-1',
      message: '주문 상태 확인해 주세요',
      messageType: 'TEXT',
      ...overrides,
    },
  } as Job<TalkTalkJobData>
}

describe('createTalkTalkWorker — 톡톡 자동 응답', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCapturedProcessor = null
    ;(getSetting as jest.Mock).mockReturnValue('true')
    ;(checkCredentialGate as jest.Mock).mockResolvedValue({ passed: true, missing: [] })
    mockAnalyzeInquiry.mockResolvedValue(DEFAULT_ANALYSIS)
    mockHandleWebhook.mockResolvedValue(WEBHOOK_MATCH)
    mockExecuteAutoReply.mockResolvedValue({ success: true, data: { messageId: 'msg-1' } })
  })

  // ---- Kill Switch ----

  it('AUTO_TALKTALK_ENABLED=false → 스킵', async () => {
    ;(getSetting as jest.Mock).mockReturnValue('false')

    createTalkTalkWorker()
    const result = await mockCapturedProcessor!(makeTalkTalkJob())

    expect(result).toEqual({ skipped: true, reason: 'kill-switch' })
    expect(mockAnalyzeInquiry).not.toHaveBeenCalled()
  })

  // ---- Credential Gate ----

  it('Credential gate 실패 → gateSkipResult 반환', async () => {
    ;(checkCredentialGate as jest.Mock).mockResolvedValue({ passed: false, missing: ['naver_talktalk'] })

    createTalkTalkWorker()
    const result = await mockCapturedProcessor!(makeTalkTalkJob())

    expect(result).toEqual({
      skipped: true,
      reason: 'credentials_not_configured',
      missingServices: ['naver_talktalk'],
    })
  })

  // ---- 분석: 주문 문의 분류 ----

  it('주문 문의 → category=ORDER로 분류', async () => {
    createTalkTalkWorker()
    const result = await mockCapturedProcessor!(makeTalkTalkJob()) as Record<string, unknown>

    expect(mockAnalyzeInquiry).toHaveBeenCalledWith('주문 상태 확인해 주세요')
    expect(result['category']).toBe('ORDER')
  })

  // ---- 자동 응답 매칭 성공 ----

  it('자동 응답 매칭 성공 → 발송 + processed: true', async () => {
    createTalkTalkWorker()
    const result = await mockCapturedProcessor!(makeTalkTalkJob())

    expect(result).toEqual(expect.objectContaining({
      processed: true,
      autoReplied: true,
      category: 'ORDER',
    }))
    expect(mockExecuteAutoReply).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 'ch-1',
        customerId: 'cust-1',
      }),
    )
  })

  // ---- 자동 응답 매칭 실패 ----

  it('자동 응답 매칭 실패 → 수동 대기', async () => {
    mockHandleWebhook.mockResolvedValue(WEBHOOK_NO_MATCH)

    createTalkTalkWorker()
    const result = await mockCapturedProcessor!(makeTalkTalkJob())

    expect(result).toEqual(expect.objectContaining({
      processed: true,
      autoReplied: false,
    }))
    expect(mockExecuteAutoReply).not.toHaveBeenCalled()
  })

  // ---- DB 대화 로그 저장 ----

  it('DB 대화 로그 저장 확인', async () => {
    createTalkTalkWorker()
    await mockCapturedProcessor!(makeTalkTalkJob())

    expect(mockConversationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channelId: 'ch-1',
        customerId: 'cust-1',
        message: '주문 상태 확인해 주세요',
        messageType: 'TEXT',
        category: 'ORDER',
        sentiment: 'NEUTRAL',
        urgency: 'MEDIUM',
        autoReplySent: true,
      }),
    })
  })

  // ---- 긴급 + 부정 → 알림 ----

  it('긴급 + 부정 감정 → 알림 발송', async () => {
    mockAnalyzeInquiry.mockResolvedValue({
      ...DEFAULT_ANALYSIS,
      sentiment: 'NEGATIVE',
      urgency: 'HIGH',
    })

    createTalkTalkWorker()
    await mockCapturedProcessor!(makeTalkTalkJob({ message: '배송이 너무 늦어요 빨리 해주세요' }))

    expect(mockNotificationSend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'talktalk_urgent',
      }),
    )
  })

  // ---- executeAutoReply 실패 → autoReplied: false ----

  it('executeAutoReply 실패 → autoReplied: false (에러 무시)', async () => {
    mockExecuteAutoReply.mockRejectedValue(new Error('API 오류'))

    createTalkTalkWorker()
    const result = await mockCapturedProcessor!(makeTalkTalkJob())

    expect(result).toEqual(expect.objectContaining({
      processed: true,
      autoReplied: false,
    }))
    // DB에는 autoReplySent: false로 저장
    expect(mockConversationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ autoReplySent: false }),
    })
  })

  // ---- analyzeInquiry 실패 → 기본값 ----

  it('analyzeInquiry 실패 → 기본값 사용 (OTHER), 계속 진행', async () => {
    mockAnalyzeInquiry.mockRejectedValue(new Error('분석 실패'))

    createTalkTalkWorker()
    const result = await mockCapturedProcessor!(makeTalkTalkJob()) as Record<string, unknown>

    expect(result['processed']).toBe(true)
    expect(result['category']).toBe('OTHER')
  })
})

// =============================================
// console.log 부재 검증
// =============================================

describe('talktalk.job.ts — console.log 부재', () => {
  it('소스 파일에 console.log가 없음', () => {
    const filePath = path.resolve(__dirname, './talktalk.job.ts')
    const source = fs.readFileSync(filePath, 'utf8')
    const consoleUsages = source.match(/console\.(log|warn|error|info)\(/g)
    expect(consoleUsages).toBeNull()
  })
})
