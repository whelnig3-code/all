// =============================================
// Credentials API 라우터 단위 테스트
// =============================================

import Fastify from 'fastify'
import { credentialsRouter } from './credentials'

// @smartstore/core 모킹
jest.mock('@smartstore/core', () => ({
  getCredentials: jest.fn(),
  saveCredentials: jest.fn(),
  deleteCredentials: jest.fn(),
  getCredentialStatus: jest.fn(),
  getAllServiceStatuses: jest.fn(),
  maskValue: jest.fn().mockImplementation((v) =>
    v.length > 4 ? v.slice(0, 2) + '***' + v.slice(-2) : '****'
  ),
}))

// credential-tester 모킹
jest.mock('./credential-tester', () => ({
  testServiceConnection: jest.fn(),
}))

// prisma 모킹
jest.mock('@smartstore/db', () => ({
  prisma: {
    serviceCredential: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}))

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(), connect: jest.fn().mockResolvedValue(undefined),
  }))
})

jest.mock('@smartstore/shared', () => ({
  createLogger: () => ({
    debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
  }),
  config: {
    redis: { host: 'localhost', port: 6379, password: undefined },
    system: { nodeEnv: 'test', port: 3100 },
  },
}))

// 모킹된 모듈 참조
const {
  getCredentials,
  saveCredentials,
  deleteCredentials,
  getCredentialStatus,
  getAllServiceStatuses,
} = jest.requireMock('@smartstore/core') as {
  getCredentials: jest.Mock
  saveCredentials: jest.Mock
  deleteCredentials: jest.Mock
  getCredentialStatus: jest.Mock
  getAllServiceStatuses: jest.Mock
}
const { testServiceConnection } = jest.requireMock('./credential-tester') as {
  testServiceConnection: jest.Mock
}
const { prisma } = jest.requireMock('@smartstore/db') as {
  prisma: {
    serviceCredential: { findUnique: jest.Mock; update: jest.Mock }
  }
}

const TEST_PASS = 'test-secure-p@ss!'
function basicAuth(user: string, pass: string): string {
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
}
const VALID_AUTH = basicAuth('admin', TEST_PASS)
const WRONG_AUTH = basicAuth('hacker', 'wrong')

async function buildApp() {
  const app = Fastify({ logger: false })
  await app.register(credentialsRouter, { prefix: '/admin/credentials' })
  return app
}

describe('Credentials API', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    jest.clearAllMocks()
    process.env['ADMIN_USER'] = 'admin'
    process.env['ADMIN_PASS'] = TEST_PASS
    app = await buildApp()
  })

  afterEach(async () => {
    await app.close()
  })

  // ---- 인증 ----

  describe('Basic Auth', () => {
    it('인증 헤더 없음 → 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/admin/credentials' })
      expect(res.statusCode).toBe(401)
      expect(res.headers['www-authenticate']).toContain('Basic')
    })

    it('잘못된 인증 → 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/credentials',
        headers: { authorization: WRONG_AUTH },
      })
      expect(res.statusCode).toBe(401)
    })

    it('올바른 인증 → 401 아님', async () => {
      getAllServiceStatuses.mockResolvedValue([])

      const res = await app.inject({
        method: 'GET',
        url: '/admin/credentials',
        headers: { authorization: VALID_AUTH },
      })
      expect(res.statusCode).not.toBe(401)
    })
  })

  // ---- GET /admin/credentials ----

  describe('GET /admin/credentials', () => {
    it('전체 서비스 상태 조회 → 200', async () => {
      getAllServiceStatuses.mockResolvedValue([
        { service: 'naver_commerce', status: 'configured' },
        { service: 'telegram', status: 'not_configured' },
      ])

      const res = await app.inject({
        method: 'GET',
        url: '/admin/credentials',
        headers: { authorization: VALID_AUTH },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().services).toHaveLength(2)
    })
  })

  // ---- GET /admin/credentials/:service ----

  describe('GET /admin/credentials/:service', () => {
    it('유효한 서비스 → 200 + 마스킹된 필드', async () => {
      getCredentialStatus.mockResolvedValue('configured')
      getCredentials.mockResolvedValue({ clientId: 'abc123', clientSecret: 'xyz789secret' })
      prisma.serviceCredential.findUnique.mockResolvedValue({
        lastTestedAt: new Date('2026-03-01'),
        testResult: 'success',
        testError: null,
      })

      const res = await app.inject({
        method: 'GET',
        url: '/admin/credentials/naver_commerce',
        headers: { authorization: VALID_AUTH },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.service).toBe('naver_commerce')
      expect(body.status).toBe('configured')
      expect(body.fields.clientId).toContain('***')
      expect(body.testResult).toBe('success')
    })

    it('잘못된 서비스명 → 400', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/credentials/invalid_service',
        headers: { authorization: VALID_AUTH },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toContain('invalid service')
      expect(res.json().allowed).toContain('naver_commerce')
    })

    it('자격증명 미설정 시 빈 필드', async () => {
      getCredentialStatus.mockResolvedValue('not_configured')
      getCredentials.mockResolvedValue(null)
      prisma.serviceCredential.findUnique.mockResolvedValue(null)

      const res = await app.inject({
        method: 'GET',
        url: '/admin/credentials/telegram',
        headers: { authorization: VALID_AUTH },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.fields).toEqual({})
      expect(body.lastTestedAt).toBeNull()
    })
  })

  // ---- PUT /admin/credentials/:service ----

  describe('PUT /admin/credentials/:service', () => {
    it('자격증명 저장 → 200 success', async () => {
      saveCredentials.mockResolvedValue(undefined)

      const res = await app.inject({
        method: 'PUT',
        url: '/admin/credentials/telegram',
        headers: { authorization: VALID_AUTH, 'content-type': 'application/json' },
        payload: { credentials: { botToken: 'test-token-123' } },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
      expect(saveCredentials).toHaveBeenCalledWith('telegram', { botToken: 'test-token-123' })
    })

    it('credentials 필드 누락 → 400', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/admin/credentials/telegram',
        headers: { authorization: VALID_AUTH, 'content-type': 'application/json' },
        payload: {},
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toContain('credentials')
    })

    it('잘못된 서비스명 → 400', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/admin/credentials/github',
        headers: { authorization: VALID_AUTH, 'content-type': 'application/json' },
        payload: { credentials: { token: 'xxx' } },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  // ---- DELETE /admin/credentials/:service ----

  describe('DELETE /admin/credentials/:service', () => {
    it('자격증명 삭제 → 200 success', async () => {
      deleteCredentials.mockResolvedValue(undefined)

      const res = await app.inject({
        method: 'DELETE',
        url: '/admin/credentials/domaegguk',
        headers: { authorization: VALID_AUTH },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
      expect(deleteCredentials).toHaveBeenCalledWith('domaegguk')
    })

    it('잘못된 서비스명 → 400', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/admin/credentials/unknown',
        headers: { authorization: VALID_AUTH },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  // ---- POST /admin/credentials/:service/test ----

  describe('POST /admin/credentials/:service/test', () => {
    it('연결 테스트 성공 → 200 + success:true', async () => {
      getCredentials.mockResolvedValue({ botToken: 'test-token' })
      testServiceConnection.mockResolvedValue({
        success: true,
        message: '봇 연결 성공: @testbot',
      })
      prisma.serviceCredential.update.mockResolvedValue({})

      const res = await app.inject({
        method: 'POST',
        url: '/admin/credentials/telegram/test',
        headers: { authorization: VALID_AUTH },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.success).toBe(true)
      expect(body.message).toContain('봇 연결 성공')
    })

    it('자격증명 미설정 → 400', async () => {
      getCredentials.mockResolvedValue(null)

      const res = await app.inject({
        method: 'POST',
        url: '/admin/credentials/naver_commerce/test',
        headers: { authorization: VALID_AUTH },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toContain('자격증명이 설정되지')
    })

    it('연결 테스트 실패 → 200 + success:false', async () => {
      getCredentials.mockResolvedValue({ clientId: 'id', clientSecret: 'secret' })
      testServiceConnection.mockResolvedValue({
        success: false,
        message: 'OAuth 토큰 발급 실패',
        error: 'invalid_client',
      })
      prisma.serviceCredential.update.mockResolvedValue({})

      const res = await app.inject({
        method: 'POST',
        url: '/admin/credentials/naver_commerce/test',
        headers: { authorization: VALID_AUTH },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.success).toBe(false)
      expect(body.error).toBe('invalid_client')
    })

    it('DB 업데이트 실패해도 결과 반환', async () => {
      getCredentials.mockResolvedValue({ botToken: 'token' })
      testServiceConnection.mockResolvedValue({
        success: true,
        message: '성공',
      })
      prisma.serviceCredential.update.mockRejectedValue(new Error('DB error'))

      const res = await app.inject({
        method: 'POST',
        url: '/admin/credentials/telegram/test',
        headers: { authorization: VALID_AUTH },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
    })
  })
})
