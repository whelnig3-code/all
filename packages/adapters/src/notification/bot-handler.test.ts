// =============================================
// Telegram 봇 커맨드 핸들러 단위 테스트
// axios 모킹으로 네트워크 없이 검증
// =============================================

import { handleBotCommand } from './bot-handler'

// axios 모킹
jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
}))

// @smartstore/shared 모킹
jest.mock('@smartstore/shared', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
  config: {
    notification: {
      telegram: {
        botToken: 'test-token',
        chatId: '12345',
      },
    },
    redis: { host: 'localhost', port: 6379, password: '' },
  },
}))

import axios from 'axios'
const mockAxios = axios as jest.Mocked<typeof axios>

const VALID_CHAT_ID = 12345

beforeEach(() => {
  process.env['API_SERVER_URL'] = 'http://localhost:3000'
  process.env['ADMIN_USER'] = 'admin'
  process.env['ADMIN_PASS'] = 'changeme'
  jest.clearAllMocks()
})

describe('handleBotCommand', () => {
  // ---- 보안: 허용되지 않은 채팅방 ----

  it('허용되지 않은 chat_id → 빈 문자열 반환 (응답 생략)', async () => {
    const result = await handleBotCommand('/status', 99999)
    expect(result).toBe('')
    // Admin API 호출 없음
    expect(mockAxios.get).not.toHaveBeenCalled()
  })

  // ---- /status ----

  it('/status → GET /admin/system 호출 후 포맷된 상태 메시지', async () => {
    mockAxios.get.mockResolvedValueOnce({
      data: {
        workerAlive: true,
        dbConnected: true,
        redisConnected: true,
        memory: { heapUsedMB: 128, rssMB: 256, heapTotalMB: 512 },
        competitorQueueDepth: 0,
        timestamp: new Date().toISOString(),
      },
    })

    const result = await handleBotCommand('/status', VALID_CHAT_ID)

    expect(result).toContain('시스템 상태')
    expect(result).toContain('정상')
    // Admin API 엔드포인트 확인
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/admin/system'),
      expect.any(Object)
    )
  })

  it('/status — DB 오류 상태 표시', async () => {
    mockAxios.get.mockResolvedValueOnce({
      data: {
        workerAlive: false,
        dbConnected: false,
        redisConnected: false,
        memory: { heapUsedMB: 64, rssMB: 128, heapTotalMB: 256 },
        competitorQueueDepth: 0,
        timestamp: new Date().toISOString(),
      },
    })

    const result = await handleBotCommand('/status', VALID_CHAT_ID)
    expect(result).toContain('오류')
  })

  // ---- /report ----

  it('/report → GET /admin/metrics 호출 후 포맷된 실적 메시지', async () => {
    mockAxios.get.mockResolvedValueOnce({
      data: {
        totalRevenue: 150000,
        totalMargin: 45000,
        orderCount: 3,
        fallbackCount: 0,
        failedJobCount: 0,
        date: '2026-03-02',
      },
    })

    const result = await handleBotCommand('/report', VALID_CHAT_ID)

    expect(result).toContain('오늘의 실적')
    expect(result).toContain('150,000')
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/admin/metrics'),
      expect.any(Object)
    )
  })

  // ---- /pause ----

  it('/pause price → AUTO_PRICE_ENABLED=false POST 전송', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: { success: true } })

    const result = await handleBotCommand('/pause price', VALID_CHAT_ID)

    expect(result).toContain('일시정지')
    expect(result).toContain('가격 자동화')

    const postCall = mockAxios.post.mock.calls[0]
    expect(postCall[0]).toContain('/admin/control')
    expect(postCall[1]).toEqual({ key: 'AUTO_PRICE_ENABLED', value: 'false' })
  })

  it('/pause order → AUTO_ORDER_ENABLED=false POST 전송', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: { success: true } })
    const result = await handleBotCommand('/pause order', VALID_CHAT_ID)
    expect(result).toContain('주문 자동화')
    expect(result).toContain('일시정지')
  })

  it('/pause shipping → AUTO_SHIPPING_ENABLED=false POST 전송', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: { success: true } })
    const result = await handleBotCommand('/pause shipping', VALID_CHAT_ID)
    expect(result).toContain('배송 자동화')
    expect(result).toContain('일시정지')
  })

  // ---- /resume ----

  it('/resume price → AUTO_PRICE_ENABLED=true POST 전송', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: { success: true } })

    const result = await handleBotCommand('/resume price', VALID_CHAT_ID)

    expect(result).toContain('재개')
    const postCall = mockAxios.post.mock.calls[0]
    expect(postCall[1]).toEqual({ key: 'AUTO_PRICE_ENABLED', value: 'true' })
  })

  // ---- /pause 인자 오류 ----

  it('/pause (인자 없음) → 도움말 메시지', async () => {
    const result = await handleBotCommand('/pause', VALID_CHAT_ID)
    expect(result).toContain('대상을 지정하세요')
  })

  it('/pause invalid → 도움말 메시지', async () => {
    const result = await handleBotCommand('/pause invalid', VALID_CHAT_ID)
    expect(result).toContain('대상을 지정하세요')
  })

  // ---- 알 수 없는 커맨드 ----

  it('알 수 없는 커맨드 → 안내 메시지', async () => {
    const result = await handleBotCommand('/unknown', VALID_CHAT_ID)
    expect(result).toContain('알 수 없는 명령어')
    expect(result).toContain('/status')
    expect(result).toContain('/pause')
  })

  // ---- 오류 처리 ----

  it('Admin API 오류 → 오류 메시지 반환 (throw 없음)', async () => {
    mockAxios.get.mockRejectedValueOnce(new Error('network error'))
    const result = await handleBotCommand('/status', VALID_CHAT_ID)
    expect(result).toContain('오류 발생')
    expect(result).toContain('network error')
  })
})
