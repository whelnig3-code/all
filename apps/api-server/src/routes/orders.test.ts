// =============================================
// Orders API 라우터 단위 테스트
// Fastify inject() 방식으로 HTTP 계층 테스트
// =============================================

import Fastify from 'fastify'
import { ordersRouter } from './orders'

// 큐 모킹
jest.mock('../queues', () => ({
  orderQueue: { add: jest.fn().mockResolvedValue(undefined) },
  shippingNotificationQueue: { add: jest.fn().mockResolvedValue(undefined) },
}))

// prisma 모킹
jest.mock('@smartstore/db', () => ({
  prisma: {
    order: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
    },
  },
}))

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    ping: jest.fn().mockResolvedValue('PONG'),
  }))
})

jest.mock('@smartstore/shared', () => ({
  createLogger: () => ({
    debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
  }),
  config: {
    redis: { host: 'localhost', port: 6379, password: undefined },
    system: { nodeEnv: 'test', port: 3100 },
    notification: { adapter: 'telegram', telegram: { botToken: 'test', chatId: '0' } },
    naver: { clientId: 'test', clientSecret: 'test', shopId: 'test' },
  },
}))

// 모킹된 모듈 참조 획득
const { prisma } = jest.requireMock('@smartstore/db') as {
  prisma: {
    order: {
      findMany: jest.Mock
      count: jest.Mock
      findUnique: jest.Mock
      update: jest.Mock
      groupBy: jest.Mock
      aggregate: jest.Mock
    }
  }
}
const { orderQueue, shippingNotificationQueue } = jest.requireMock('../queues') as {
  orderQueue: { add: jest.Mock }
  shippingNotificationQueue: { add: jest.Mock }
}

async function buildApp() {
  const app = Fastify({ logger: false })
  await app.register(ordersRouter, { prefix: '/orders' })
  return app
}

describe('Orders API', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    jest.clearAllMocks()
    app = await buildApp()
  })

  afterEach(async () => {
    await app.close()
  })

  // ---- GET /orders ----

  describe('GET /orders', () => {
    it('주문 목록 조회 → 200 + pagination', async () => {
      const mockOrders = [
        { id: '1', naverOrderId: 'N001', status: 'paid', orderedAt: new Date() },
      ]
      prisma.order.findMany.mockResolvedValue(mockOrders)
      prisma.order.count.mockResolvedValue(1)

      const res = await app.inject({ method: 'GET', url: '/orders' })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data).toHaveLength(1)
      expect(body.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      })
    })

    it('status 필터 적용', async () => {
      prisma.order.findMany.mockResolvedValue([])
      prisma.order.count.mockResolvedValue(0)

      await app.inject({ method: 'GET', url: '/orders?status=paid' })

      const whereArg = prisma.order.findMany.mock.calls[0][0].where
      expect(whereArg.status).toBe('paid')
    })

    it('날짜 범위 필터 from/to', async () => {
      prisma.order.findMany.mockResolvedValue([])
      prisma.order.count.mockResolvedValue(0)

      await app.inject({
        method: 'GET',
        url: '/orders?from=2026-01-01&to=2026-03-01',
      })

      const whereArg = prisma.order.findMany.mock.calls[0][0].where
      expect(whereArg.orderedAt).toBeDefined()
      expect(whereArg.orderedAt.gte).toEqual(new Date('2026-01-01'))
      expect(whereArg.orderedAt.lte).toEqual(new Date('2026-03-01'))
    })

    it('limit 100 초과 → 100으로 제한', async () => {
      prisma.order.findMany.mockResolvedValue([])
      prisma.order.count.mockResolvedValue(0)

      await app.inject({ method: 'GET', url: '/orders?limit=200' })

      const takeArg = prisma.order.findMany.mock.calls[0][0].take
      expect(takeArg).toBe(100)
    })

    it('page=2 → skip 올바르게 계산', async () => {
      prisma.order.findMany.mockResolvedValue([])
      prisma.order.count.mockResolvedValue(50)

      await app.inject({ method: 'GET', url: '/orders?page=2&limit=20' })

      const skipArg = prisma.order.findMany.mock.calls[0][0].skip
      expect(skipArg).toBe(20)
    })
  })

  // ---- GET /orders/:id ----

  describe('GET /orders/:id', () => {
    it('존재하는 주문 → 200', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        naverOrderId: 'N001',
        status: 'paid',
        product: { name: '테스트 상품' },
      })

      const res = await app.inject({ method: 'GET', url: '/orders/order-1' })

      expect(res.statusCode).toBe(200)
      expect(res.json().id).toBe('order-1')
    })

    it('존재하지 않는 주문 → 404', async () => {
      prisma.order.findUnique.mockResolvedValue(null)

      const res = await app.inject({ method: 'GET', url: '/orders/not-found' })

      expect(res.statusCode).toBe(404)
      expect(res.json().error).toContain('찾을 수 없습니다')
    })
  })

  // ---- POST /orders/poll ----

  describe('POST /orders/poll', () => {
    it('수동 폴링 트리거 → 200 + 큐 추가', async () => {
      const res = await app.inject({ method: 'POST', url: '/orders/poll' })

      expect(res.statusCode).toBe(200)
      expect(res.json().message).toContain('트리거')
      expect(orderQueue.add).toHaveBeenCalledWith(
        'poll-orders',
        expect.objectContaining({ trigger: 'manual' }),
      )
    })
  })

  // ---- POST /orders/:id/ship ----

  describe('POST /orders/:id/ship', () => {
    const shipPayload = {
      trackingNumber: '123456789',
      courier: 'CJ대한통운',
    }

    it('정상 발송 처리 → 200 + 큐 추가', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        naverOrderId: 'N001',
        status: 'paid',
        customerName: '홍길동',
        product: { name: '테스트 상품' },
      })
      prisma.order.update.mockResolvedValue({})

      const res = await app.inject({
        method: 'POST',
        url: '/orders/order-1/ship',
        headers: { 'content-type': 'application/json' },
        payload: shipPayload,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().trackingNumber).toBe('123456789')
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'order-1' },
          data: expect.objectContaining({
            status: 'preparing',
            trackingNumber: '123456789',
            courier: 'CJ대한통운',
          }),
        }),
      )
      expect(shippingNotificationQueue.add).toHaveBeenCalledWith(
        'notify-shipping',
        expect.objectContaining({
          orderId: 'order-1',
          trackingNumber: '123456789',
        }),
        { priority: 1 },
      )
    })

    it('주문 없음 → 404', async () => {
      prisma.order.findUnique.mockResolvedValue(null)

      const res = await app.inject({
        method: 'POST',
        url: '/orders/not-found/ship',
        headers: { 'content-type': 'application/json' },
        payload: shipPayload,
      })

      expect(res.statusCode).toBe(404)
    })

    it('발송 불가 상태 (shipped) → 400', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        status: 'shipped',
        product: { name: '상품' },
      })

      const res = await app.inject({
        method: 'POST',
        url: '/orders/order-1/ship',
        headers: { 'content-type': 'application/json' },
        payload: shipPayload,
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toContain('발송 처리 불가')
    })

    it('preparing 상태에서 발송 처리 가능', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        naverOrderId: 'N001',
        status: 'preparing',
        customerName: '홍길동',
        product: { name: '상품' },
      })
      prisma.order.update.mockResolvedValue({})

      const res = await app.inject({
        method: 'POST',
        url: '/orders/order-1/ship',
        headers: { 'content-type': 'application/json' },
        payload: shipPayload,
      })

      expect(res.statusCode).toBe(200)
    })
  })

  // ---- GET /orders/stats ----

  describe('GET /orders/stats', () => {
    it('주문 통계 → 200 + statusBreakdown + revenue', async () => {
      prisma.order.groupBy.mockResolvedValue([
        { status: 'paid', _count: 5 },
        { status: 'shipped', _count: 3 },
      ])
      prisma.order.aggregate.mockResolvedValue({
        _sum: { totalAmount: 500000 },
        _count: 8,
      })

      const res = await app.inject({ method: 'GET', url: '/orders/stats' })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.statusBreakdown.paid).toBe(5)
      expect(body.statusBreakdown.shipped).toBe(3)
      expect(body.revenue.total).toBe(500000)
      expect(body.revenue.orderCount).toBe(8)
    })

    it('날짜 필터 적용 시 where에 포함', async () => {
      prisma.order.groupBy.mockResolvedValue([])
      prisma.order.aggregate.mockResolvedValue({
        _sum: { totalAmount: null },
        _count: 0,
      })

      await app.inject({ method: 'GET', url: '/orders/stats?from=2026-01-01' })

      const groupByWhere = prisma.order.groupBy.mock.calls[0][0].where
      expect(groupByWhere.orderedAt).toBeDefined()
      expect(groupByWhere.orderedAt.gte).toEqual(new Date('2026-01-01'))
    })

    it('매출 null → 0 반환', async () => {
      prisma.order.groupBy.mockResolvedValue([])
      prisma.order.aggregate.mockResolvedValue({
        _sum: { totalAmount: null },
        _count: 0,
      })

      const res = await app.inject({ method: 'GET', url: '/orders/stats' })

      expect(res.json().revenue.total).toBe(0)
    })
  })
})
