// =============================================
// Monitoring API 라우터 단위 테스트
// =============================================

import Fastify from 'fastify'
import { monitoringRouter } from './monitoring'

// 큐 모킹
jest.mock('../queues', () => ({
  registrationQueue: {
    getWaitingCount: jest.fn().mockResolvedValue(2),
    getActiveCount: jest.fn().mockResolvedValue(1),
    getCompletedCount: jest.fn().mockResolvedValue(10),
    getFailedCount: jest.fn().mockResolvedValue(0),
  },
  orderQueue: {
    getWaitingCount: jest.fn().mockResolvedValue(0),
    getActiveCount: jest.fn().mockResolvedValue(0),
    getCompletedCount: jest.fn().mockResolvedValue(5),
    getFailedCount: jest.fn().mockResolvedValue(1),
  },
  shippingNotificationQueue: {
    getWaitingCount: jest.fn().mockResolvedValue(0),
    getActiveCount: jest.fn().mockResolvedValue(0),
    getCompletedCount: jest.fn().mockResolvedValue(0),
    getFailedCount: jest.fn().mockResolvedValue(0),
  },
  priceMonitorQueue: {
    getWaitingCount: jest.fn().mockResolvedValue(3),
    getActiveCount: jest.fn().mockResolvedValue(0),
    getCompletedCount: jest.fn().mockResolvedValue(20),
    getFailedCount: jest.fn().mockResolvedValue(2),
  },
}))

// prisma 모킹
jest.mock('@smartstore/db', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    product: { count: jest.fn() },
    order: {
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    jobLog: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}))

// 외부 의존 모킹
jest.mock('@smartstore/integrations', () => ({
  naverCommerceApi: { healthCheck: jest.fn() },
}))

jest.mock('@smartstore/adapters', () => ({
  notificationAdapter: { healthCheck: jest.fn() },
}))

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
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
const { prisma } = jest.requireMock('@smartstore/db') as {
  prisma: {
    $queryRaw: jest.Mock
    product: { count: jest.Mock }
    order: { count: jest.Mock; aggregate: jest.Mock }
    jobLog: { findMany: jest.Mock; count: jest.Mock }
  }
}
const { naverCommerceApi } = jest.requireMock('@smartstore/integrations') as {
  naverCommerceApi: { healthCheck: jest.Mock }
}
const { notificationAdapter } = jest.requireMock('@smartstore/adapters') as {
  notificationAdapter: { healthCheck: jest.Mock }
}

const TEST_USER = 'admin'
const TEST_PASS = 'test-pass-1234!'
const AUTH_HEADER = 'Basic ' + Buffer.from(`${TEST_USER}:${TEST_PASS}`).toString('base64')

async function buildApp() {
  const app = Fastify({ logger: false })
  await app.register(monitoringRouter, { prefix: '/monitoring' })
  return app
}

describe('Monitoring API', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  /** inject with auth header */
  function authInject(opts: Parameters<typeof app.inject>[0]) {
    const o = typeof opts === 'string' ? { url: opts, method: 'GET' as const } : opts
    return app.inject({ ...o, headers: { ...o.headers, Authorization: AUTH_HEADER } })
  }

  beforeEach(async () => {
    jest.clearAllMocks()
    process.env['ADMIN_USER'] = TEST_USER
    process.env['ADMIN_PASS'] = TEST_PASS
    app = await buildApp()
  })

  afterEach(async () => {
    await app.close()
  })

  // ---- GET /monitoring/health ----

  describe('GET /monitoring/health', () => {
    it('모든 서비스 정상 → 200 healthy', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }])
      naverCommerceApi.healthCheck.mockResolvedValue(true)
      notificationAdapter.healthCheck.mockResolvedValue(true)

      const res = await app.inject({ method: 'GET', url: '/monitoring/health' })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.status).toBe('healthy')
      expect(body.checks.database).toBe('ok')
      expect(body.checks.naver_api).toBe('ok')
      expect(body.checks.notification).toBe('ok')
      expect(body.checks.timestamp).toBeDefined()
    })

    it('DB 실패 → 503 degraded', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('DB 연결 실패'))
      naverCommerceApi.healthCheck.mockResolvedValue(true)
      notificationAdapter.healthCheck.mockResolvedValue(true)

      const res = await app.inject({ method: 'GET', url: '/monitoring/health' })

      expect(res.statusCode).toBe(503)
      const body = res.json()
      expect(body.status).toBe('degraded')
      expect(body.checks.database).toBe('error')
    })

    it('네이버 API 실패 → 200 degraded (DB는 정상)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }])
      naverCommerceApi.healthCheck.mockResolvedValue(false)
      notificationAdapter.healthCheck.mockResolvedValue(true)

      const res = await app.inject({ method: 'GET', url: '/monitoring/health' })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.status).toBe('degraded')
      expect(body.checks.naver_api).toBe('error')
    })

    it('알림 서비스 예외 → degraded', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }])
      naverCommerceApi.healthCheck.mockResolvedValue(true)
      notificationAdapter.healthCheck.mockRejectedValue(new Error('timeout'))

      const res = await app.inject({ method: 'GET', url: '/monitoring/health' })

      const body = res.json()
      expect(body.status).toBe('degraded')
      expect(body.checks.notification).toBe('error')
    })
  })

  // ---- GET /monitoring/queues ----

  describe('GET /monitoring/queues', () => {
    it('큐 상태 조회 → 200 + 4개 큐 통계', async () => {
      const res = await authInject({ method: 'GET', url: '/monitoring/queues' })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.queues).toHaveLength(4)
      expect(body.queues[0].name).toBe('상품등록')
      expect(body.queues[0].waiting).toBe(2)
      expect(body.queues[0].active).toBe(1)
      expect(body.queues[0].completed).toBe(10)
      expect(body.queues[0].failed).toBe(0)
    })
  })

  // ---- GET /monitoring/jobs ----

  describe('GET /monitoring/jobs', () => {
    it('작업 로그 조회 → 200 + pagination', async () => {
      prisma.jobLog.findMany.mockResolvedValue([
        { id: '1', jobType: 'registration', status: 'completed', startedAt: new Date() },
      ])
      prisma.jobLog.count.mockResolvedValue(1)

      const res = await authInject({ method: 'GET', url: '/monitoring/jobs' })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data).toHaveLength(1)
      expect(body.pagination.page).toBe(1)
      expect(body.pagination.total).toBe(1)
    })

    it('type 필터 적용', async () => {
      prisma.jobLog.findMany.mockResolvedValue([])
      prisma.jobLog.count.mockResolvedValue(0)

      await authInject({ method: 'GET', url: '/monitoring/jobs?type=registration' })

      const whereArg = prisma.jobLog.findMany.mock.calls[0][0].where
      expect(whereArg.jobType).toBe('registration')
    })

    it('status 필터 적용', async () => {
      prisma.jobLog.findMany.mockResolvedValue([])
      prisma.jobLog.count.mockResolvedValue(0)

      await authInject({ method: 'GET', url: '/monitoring/jobs?status=failed' })

      const whereArg = prisma.jobLog.findMany.mock.calls[0][0].where
      expect(whereArg.status).toBe('failed')
    })

    it('limit 100 초과 → 100 제한', async () => {
      prisma.jobLog.findMany.mockResolvedValue([])
      prisma.jobLog.count.mockResolvedValue(0)

      await authInject({ method: 'GET', url: '/monitoring/jobs?limit=500' })

      const takeArg = prisma.jobLog.findMany.mock.calls[0][0].take
      expect(takeArg).toBe(100)
    })
  })

  // ---- GET /monitoring/summary ----

  describe('GET /monitoring/summary', () => {
    it('대시보드 요약 → 200 + products + today + recentJobs', async () => {
      prisma.product.count
        .mockResolvedValueOnce(100)  // total
        .mockResolvedValueOnce(80)   // active
        .mockResolvedValueOnce(15)   // pending
      prisma.order.count.mockResolvedValue(5)
      prisma.order.aggregate.mockResolvedValue({ _sum: { totalAmount: 250000 } })
      prisma.jobLog.findMany.mockResolvedValue([
        { jobType: 'registration', status: 'completed', startedAt: new Date() },
      ])

      const res = await authInject({ method: 'GET', url: '/monitoring/summary' })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.products.total).toBe(100)
      expect(body.products.active).toBe(80)
      expect(body.products.pending).toBe(15)
      expect(body.today.orders).toBe(5)
      expect(body.today.revenue).toBe(250000)
      expect(body.recentJobs).toHaveLength(1)
      expect(body.generatedAt).toBeDefined()
    })

    it('매출 null → 0 반환', async () => {
      prisma.product.count.mockResolvedValue(0)
      prisma.order.count.mockResolvedValue(0)
      prisma.order.aggregate.mockResolvedValue({ _sum: { totalAmount: null } })
      prisma.jobLog.findMany.mockResolvedValue([])

      const res = await authInject({ method: 'GET', url: '/monitoring/summary' })

      expect(res.json().today.revenue).toBe(0)
    })
  })
})
