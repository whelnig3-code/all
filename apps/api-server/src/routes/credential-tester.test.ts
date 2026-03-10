// =============================================
// Credential Tester 단위 테스트
// 외부 API 호출은 모두 모킹
// =============================================

import { testServiceConnection } from './credential-tester'

// axios 모킹
jest.mock('axios', () => ({
  post: jest.fn(),
  get: jest.fn(),
}))

// bcrypt 모킹 (네이버 커머스 서명에 사용)
jest.mock('bcrypt', () => ({
  hashSync: (password: string, _salt: string) => `bcrypt_hashed_${password}`,
}))

jest.mock('@smartstore/shared', () => ({
  createLogger: () => ({
    debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
  }),
}))

const axios = jest.requireMock('axios') as {
  post: jest.Mock
  get: jest.Mock
}

describe('testServiceConnection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // ---- 네이버 커머스 ----

  describe('naver_commerce', () => {
    it('토큰 발급 성공 → success: true', async () => {
      axios.post.mockResolvedValue({
        data: { access_token: 'test-token-123' },
      })

      const result = await testServiceConnection('naver_commerce', {
        clientId: 'test-id',
        clientSecret: 'test-secret',
      })

      expect(result.success).toBe(true)
      expect(result.message).toContain('토큰 발급 성공')
    })

    it('필수 필드 누락 → success: false', async () => {
      const result = await testServiceConnection('naver_commerce', {
        clientId: 'test-id',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('missing_fields')
    })

    it('API 에러 → success: false', async () => {
      axios.post.mockRejectedValue(new Error('Network error'))

      const result = await testServiceConnection('naver_commerce', {
        clientId: 'test-id',
        clientSecret: 'test-secret',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('auth_error')
    })

    it('토큰 없는 응답 → success: false', async () => {
      axios.post.mockResolvedValue({ data: { error: 'invalid_client' } })

      const result = await testServiceConnection('naver_commerce', {
        clientId: 'test-id',
        clientSecret: 'test-secret',
      })

      expect(result.success).toBe(false)
      expect(result.message).toContain('토큰 응답 이상')
    })
  })

  // ---- 네이버 블로그 ----

  describe('naver_blog', () => {
    it('API 인증 성공 → success: true', async () => {
      axios.get.mockResolvedValue({ status: 200, data: {} })

      const result = await testServiceConnection('naver_blog', {
        accessToken: 'valid-token',
      })

      expect(result.success).toBe(true)
      expect(result.message).toContain('블로그 API 인증 성공')
    })

    it('accessToken 누락 → success: false', async () => {
      const result = await testServiceConnection('naver_blog', {})

      expect(result.success).toBe(false)
      expect(result.error).toBe('missing_fields')
    })
  })

  // ---- 텔레그램 ----

  describe('telegram', () => {
    it('봇 연결 성공 → success: true + 봇 이름 포함', async () => {
      axios.get.mockResolvedValue({
        data: { ok: true, result: { username: 'test_bot' } },
      })

      const result = await testServiceConnection('telegram', {
        botToken: '123:ABC',
      })

      expect(result.success).toBe(true)
      expect(result.message).toContain('@test_bot')
    })

    it('botToken 누락 → success: false', async () => {
      const result = await testServiceConnection('telegram', {})

      expect(result.success).toBe(false)
      expect(result.error).toBe('missing_fields')
    })

    it('API 응답 ok:false → success: false', async () => {
      axios.get.mockResolvedValue({ data: { ok: false } })

      const result = await testServiceConnection('telegram', {
        botToken: 'invalid',
      })

      expect(result.success).toBe(false)
    })
  })

  // ---- 도매꾹 ----

  describe('domaegguk', () => {
    it('로그인 성공 (Set-Cookie 있음) → success: true', async () => {
      axios.post.mockResolvedValue({
        headers: { 'set-cookie': ['session=abc123; path=/'] },
      })

      const result = await testServiceConnection('domaegguk', {
        username: 'user1',
        password: 'pass1',
      })

      expect(result.success).toBe(true)
      expect(result.message).toContain('도매꾹 로그인 성공')
    })

    it('로그인 실패 (쿠키 없음) → success: false', async () => {
      axios.post.mockResolvedValue({
        headers: { 'set-cookie': undefined },
      })

      const result = await testServiceConnection('domaegguk', {
        username: 'user1',
        password: 'wrong',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('no_session_cookie')
    })

    it('필수 필드 누락 → success: false', async () => {
      const result = await testServiceConnection('domaegguk', {
        username: 'user1',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('missing_fields')
    })
  })

  // ---- 오너클랜 ----

  describe('ownerclan', () => {
    it('로그인 성공 → success: true', async () => {
      axios.post.mockResolvedValue({
        headers: { 'set-cookie': ['PHPSESSID=xyz; path=/'] },
      })

      const result = await testServiceConnection('ownerclan', {
        username: 'user1',
        password: 'pass1',
      })

      expect(result.success).toBe(true)
      expect(result.message).toContain('오너클랜 로그인 성공')
    })

    it('네트워크 에러 → 에러 메시지 포함', async () => {
      axios.post.mockRejectedValue(new Error('ECONNREFUSED'))

      const result = await testServiceConnection('ownerclan', {
        username: 'user1',
        password: 'pass1',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('login_error')
    })
  })
})
