// =============================================
// Admin API 라우터 단위 테스트
// Fastify inject() 방식으로 HTTP 계층 테스트
// =============================================

import Fastify from 'fastify'
import { adminRouter } from './admin'

// @smartstore/db prisma 모킹
jest.mock('@smartstore/db', () => ({
  prisma: {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    order: {
      aggregate: jest.fn().mockResolvedValue({
        _sum: { salePrice: 150000, marginAmount: 45000 },
        _count: { id: 3 },
      }),
    },
    jobLog: {
      count: jest.fn().mockResolvedValue(2),
    },
    systemSetting: {
      findMany: jest.fn().mockResolvedValue([
        { key: 'AUTO_PRICE_ENABLED', value: 'true' },
        { key: 'AUTO_ORDER_ENABLED', value: 'false' },
        { key: 'AUTO_SHIPPING_ENABLED', value: 'true' },
      ]),
      upsert: jest.fn().mockResolvedValue({
        key: 'AUTO_PRICE_ENABLED',
        value: 'false',
        updatedAt: new Date(),
      }),
    },
  },
}))

// ioredis 모킹 (Redis 연결 없이 테스트)
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    ping: jest.fn().mockResolvedValue('PONG'),
  }))
})

// @smartstore/shared 모킹
jest.mock('@smartstore/shared', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
  config: {
    redis: { host: 'localhost', port: 6379, password: undefined },
    system: { nodeEnv: 'test', port: 3000 },
  },
}))

/** Basic Auth 헤더 생성 헬퍼 */
function basicAuth(user: string, pass: string): string {
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
}

// 테스트용 자격증명 — 실제 'changeme' 대신 강력한 테스트 패스워드 사용
const TEST_PASS = 'test-secure-p@ss!'
const VALID_AUTH = basicAuth('admin', TEST_PASS)
const WRONG_AUTH = basicAuth('hacker', 'wrong')

/** 테스트용 Fastify 앱 빌드 */
async function buildApp() {
  const app = Fastify({ logger: false })
  await app.register(adminRouter, { prefix: '/admin' })
  return app
}

describe('Admin API', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    // verifyBasicAuth 폴백 제거에 따라 명시적으로 환경변수 설정
    process.env['ADMIN_USER'] = 'admin'
    process.env['ADMIN_PASS'] = TEST_PASS
    app = await buildApp()
  })

  afterEach(async () => {
    await app.close()
  })

  // ---- 인증 ----

  it('Authorization 헤더 없음 → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/system' })
    expect(res.statusCode).toBe(401)
  })

  it('잘못된 인증 정보 → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/system',
      headers: { authorization: WRONG_AUTH },
    })
    expect(res.statusCode).toBe(401)
  })

  it('올바른 인증 → 401 아님', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/system',
      headers: { authorization: VALID_AUTH },
    })
    expect(res.statusCode).not.toBe(401)
  })

  // ---- GET /admin/system ----

  it('GET /admin/system → 200 + 올바른 응답 형태', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/system',
      headers: { authorization: VALID_AUTH },
    })
    expect(res.statusCode).toBe(200)

    const body = res.json<{
      workerAlive: boolean
      dbConnected: boolean
      redisConnected: boolean
      memory: { heapUsedMB: number; rssMB: number; heapTotalMB: number }
      competitorQueueDepth: number
      timestamp: string
      settings: {
        AUTO_PRICE_ENABLED: string
        AUTO_ORDER_ENABLED: string
        AUTO_SHIPPING_ENABLED: string
      }
    }>()

    expect(typeof body.workerAlive).toBe('boolean')
    expect(typeof body.dbConnected).toBe('boolean')
    expect(typeof body.redisConnected).toBe('boolean')
    expect(typeof body.memory.heapUsedMB).toBe('number')
    expect(typeof body.competitorQueueDepth).toBe('number')
    expect(typeof body.timestamp).toBe('string')
    // Kill Switch 설정값 포함 여부
    expect(body.settings).toBeDefined()
    expect(body.settings.AUTO_PRICE_ENABLED).toBe('true')
    expect(body.settings.AUTO_ORDER_ENABLED).toBe('false')   // 목 데이터에서 false
    expect(body.settings.AUTO_SHIPPING_ENABLED).toBe('true')
  })

  // ---- GET /admin/metrics ----

  it('GET /admin/metrics → 200 + 숫자 필드 포함', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/metrics',
      headers: { authorization: VALID_AUTH },
    })
    expect(res.statusCode).toBe(200)

    const body = res.json<{
      totalRevenue: number
      totalMargin: number
      orderCount: number
      failedJobCount: number
      date: string
    }>()

    expect(typeof body.totalRevenue).toBe('number')
    expect(typeof body.totalMargin).toBe('number')
    expect(typeof body.orderCount).toBe('number')
    expect(typeof body.failedJobCount).toBe('number')
    expect(typeof body.date).toBe('string')
  })

  // ---- POST /admin/control ----

  it('POST /admin/control — 허용되지 않은 key → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/control',
      headers: { authorization: VALID_AUTH, 'content-type': 'application/json' },
      payload: { key: 'INVALID_KEY', value: 'false' },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json<{ error: string; allowed: string[] }>()
    expect(body.allowed).toContain('AUTO_PRICE_ENABLED')
  })

  it('POST /admin/control — value가 "true"/"false"가 아님 → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/control',
      headers: { authorization: VALID_AUTH, 'content-type': 'application/json' },
      payload: { key: 'AUTO_PRICE_ENABLED', value: 'maybe' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('POST /admin/control — 유효한 요청 → 200 + success:true', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/control',
      headers: { authorization: VALID_AUTH, 'content-type': 'application/json' },
      payload: { key: 'AUTO_PRICE_ENABLED', value: 'false' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json<{ success: boolean; key: string; value: string }>()
    expect(body.success).toBe(true)
    expect(body.key).toBe('AUTO_PRICE_ENABLED')
    expect(body.value).toBe('false')
  })

  it('POST /admin/control — AUTO_ORDER_ENABLED 활성화 → 200', async () => {
    const { prisma } = jest.requireMock('@smartstore/db') as {
      prisma: { systemSetting: { upsert: jest.Mock } }
    }
    prisma.systemSetting.upsert.mockResolvedValueOnce({
      key: 'AUTO_ORDER_ENABLED',
      value: 'true',
      updatedAt: new Date(),
    })

    const res = await app.inject({
      method: 'POST',
      url: '/admin/control',
      headers: { authorization: VALID_AUTH, 'content-type': 'application/json' },
      payload: { key: 'AUTO_ORDER_ENABLED', value: 'true' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json<{ success: boolean }>()
    expect(body.success).toBe(true)
  })
})
