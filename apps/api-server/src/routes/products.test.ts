// =============================================
// Products API 라우터 단위 테스트
// =============================================

import Fastify from 'fastify'
import { productsRouter } from './products'

// 큐 모킹
jest.mock('../queues', () => ({
  registrationQueue: { add: jest.fn().mockResolvedValue(undefined) },
}))

// prisma 모킹
jest.mock('@smartstore/db', () => ({
  prisma: {
    product: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}))

// core 모킹
jest.mock('@smartstore/core', () => ({
  calculateWholesalePrice: jest.fn(),
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

const { prisma } = jest.requireMock('@smartstore/db') as {
  prisma: {
    product: {
      findMany: jest.Mock
      count: jest.Mock
      findUnique: jest.Mock
      create: jest.Mock
    }
  }
}
const { registrationQueue } = jest.requireMock('../queues') as {
  registrationQueue: { add: jest.Mock }
}
const { calculateWholesalePrice } = jest.requireMock('@smartstore/core') as {
  calculateWholesalePrice: jest.Mock
}

const TEST_USER = 'admin'
const TEST_PASS = 'test-pass-1234!'
const AUTH_HEADER = 'Basic ' + Buffer.from(`${TEST_USER}:${TEST_PASS}`).toString('base64')

async function buildApp() {
  const app = Fastify({ logger: false })
  await app.register(productsRouter, { prefix: '/products' })
  return app
}

describe('Products API', () => {
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

  // ---- GET /products ----

  describe('GET /products', () => {
    it('상품 목록 조회 → 200 + pagination', async () => {
      prisma.product.findMany.mockResolvedValue([
        { id: '1', name: '테스트', status: 'pending' },
      ])
      prisma.product.count.mockResolvedValue(1)

      const res = await authInject({ method: 'GET', url: '/products' })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data).toHaveLength(1)
      expect(body.pagination.page).toBe(1)
      expect(body.pagination.limit).toBe(20)
    })

    it('status 필터 적용', async () => {
      prisma.product.findMany.mockResolvedValue([])
      prisma.product.count.mockResolvedValue(0)

      await authInject({ method: 'GET', url: '/products?status=active' })

      const whereArg = prisma.product.findMany.mock.calls[0][0].where
      expect(whereArg.status).toBe('active')
    })

    it('limit 100 초과 → 100 제한', async () => {
      prisma.product.findMany.mockResolvedValue([])
      prisma.product.count.mockResolvedValue(0)

      await authInject({ method: 'GET', url: '/products?limit=300' })

      expect(prisma.product.findMany.mock.calls[0][0].take).toBe(100)
    })
  })

  // ---- GET /products/:id ----

  describe('GET /products/:id', () => {
    it('존재하는 상품 → 200', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        name: '테스트 상품',
        priceHistory: [],
        competitorPrices: [],
      })

      const res = await authInject({ method: 'GET', url: '/products/prod-1' })

      expect(res.statusCode).toBe(200)
      expect(res.json().id).toBe('prod-1')
    })

    it('존재하지 않는 상품 → 404', async () => {
      prisma.product.findUnique.mockResolvedValue(null)

      const res = await authInject({ method: 'GET', url: '/products/not-found' })

      expect(res.statusCode).toBe(404)
    })
  })

  // ---- POST /products ----

  describe('POST /products', () => {
    const validPayload = {
      source: 'domaegguk',
      sourceProductId: '12345',
      name: '테스트 상품',
      wholesalePrice: 10000,
      shippingFee: 2500,
      naverFeeRate: 0.05,
      targetMarginRate: 0.3,
      images: ['https://example.com/img.jpg'],
    }

    it('유효한 입력 → 201 + 상품 생성 + 큐 추가', async () => {
      calculateWholesalePrice.mockReturnValue({
        salePrice: 19240,
        margin: 5770,
        marginRate: 0.3,
      })
      prisma.product.create.mockResolvedValue({
        id: 'new-prod-1',
        ...validPayload,
        salePrice: 19240,
      })

      const res = await authInject({
        method: 'POST',
        url: '/products',
        headers: { 'content-type': 'application/json' },
        payload: validPayload,
      })

      expect(res.statusCode).toBe(201)
      expect(res.json().product.id).toBe('new-prod-1')
      expect(res.json().priceCalculation.salePrice).toBe(19240)
      expect(registrationQueue.add).toHaveBeenCalledWith(
        'register-product',
        { productId: 'new-prod-1' },
      )
    })

    it('Zod 검증 실패 (마진율 15% 미만) → 400', async () => {
      const res = await authInject({
        method: 'POST',
        url: '/products',
        headers: { 'content-type': 'application/json' },
        payload: { ...validPayload, targetMarginRate: 0.1 },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toContain('입력 검증 실패')
    })

    it('필수 필드 누락 → 400', async () => {
      const { name: _, ...noName } = validPayload

      const res = await authInject({
        method: 'POST',
        url: '/products',
        headers: { 'content-type': 'application/json' },
        payload: noName,
      })

      expect(res.statusCode).toBe(400)
    })

    it('가격 계산 에러 → 400', async () => {
      calculateWholesalePrice.mockImplementation(() => {
        throw new Error('마진율이 너무 낮음')
      })

      const res = await authInject({
        method: 'POST',
        url: '/products',
        headers: { 'content-type': 'application/json' },
        payload: validPayload,
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toContain('마진율이 너무 낮음')
    })
  })

  // ---- POST /products/:id/register ----

  describe('POST /products/:id/register', () => {
    it('pending 상품 → 200 + 큐 추가', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        status: 'pending',
      })

      const res = await authInject({
        method: 'POST',
        url: '/products/prod-1/register',
      })

      expect(res.statusCode).toBe(200)
      expect(registrationQueue.add).toHaveBeenCalledWith(
        'register-product',
        { productId: 'prod-1' },
        { priority: 1 },
      )
    })

    it('존재하지 않는 상품 → 404', async () => {
      prisma.product.findUnique.mockResolvedValue(null)

      const res = await authInject({
        method: 'POST',
        url: '/products/not-found/register',
      })

      expect(res.statusCode).toBe(404)
    })

    it('pending이 아닌 상태 → 400', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        status: 'active',
      })

      const res = await authInject({
        method: 'POST',
        url: '/products/prod-1/register',
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toContain('pending 상태가 아닙니다')
    })
  })

  // ---- GET /products/:id/price-simulation ----

  describe('GET /products/:id/price-simulation', () => {
    it('가격 시뮬레이션 → 200 + 여러 마진율 결과', async () => {
      prisma.product.findUnique.mockResolvedValue({
        wholesalePrice: 10000,
        shippingFee: 2500,
        naverFeeRate: 0.05,
      })
      calculateWholesalePrice.mockReturnValue({
        salePrice: 19240,
        margin: 5770,
        marginRate: 0.3,
      })

      const res = await authInject({
        method: 'GET',
        url: '/products/prod-1/price-simulation',
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.simulations.length).toBeGreaterThan(0)
    })

    it('상품 없음 → 404', async () => {
      prisma.product.findUnique.mockResolvedValue(null)

      const res = await authInject({
        method: 'GET',
        url: '/products/not-found/price-simulation',
      })

      expect(res.statusCode).toBe(404)
    })
  })
})
