// =============================================
// Inventory API 라우터 단위 테스트
// Fastify inject() 방식으로 HTTP 계층 테스트
// =============================================

import Fastify from 'fastify'
import { inventoryRouter } from './inventory'

// 큐 모킹
jest.mock('../queues', () => ({
  inventorySyncQueue: { add: jest.fn().mockResolvedValue(undefined) },
}))

// prisma 모킹
jest.mock('@smartstore/db', () => ({
  prisma: {
    product: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
    inventoryEvent: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}))

// core 모킹
jest.mock('@smartstore/core', () => ({
  getAvailableStock: jest.fn(),
  getSellableStock: jest.fn(),
  isStockCacheFresh: jest.fn(),
  pauseListing: jest.fn(),
  resumeListing: jest.fn(),
}))

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
  }))
})

jest.mock('@smartstore/shared', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
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
    }
    inventoryEvent: {
      findMany: jest.Mock
      count: jest.Mock
    }
  }
}

const { inventorySyncQueue } = jest.requireMock('../queues') as {
  inventorySyncQueue: { add: jest.Mock }
}

const {
  getAvailableStock,
  getSellableStock,
  isStockCacheFresh,
  pauseListing,
  resumeListing,
} = jest.requireMock('@smartstore/core') as {
  getAvailableStock: jest.Mock
  getSellableStock: jest.Mock
  isStockCacheFresh: jest.Mock
  pauseListing: jest.Mock
  resumeListing: jest.Mock
}

// 테스트 픽스처
const mockProduct = {
  id: 'prod-1',
  name: '테스트 상품',
  source: 'domaegguk',
  supplierStock: 10,
  cachedStock: 5,
  reservedStock: 1,
  lastStockSync: new Date('2026-03-09T10:00:00Z'),
  listingPaused: false,
  status: 'active',
}

const mockProductDetail = {
  ...mockProduct,
  listingPausedAt: null,
}

const mockEvent = {
  id: 'evt-1',
  productId: 'prod-1',
  type: 'sync',
  previousStock: 3,
  newStock: 5,
  reason: '자동 동기화',
  createdAt: new Date('2026-03-09T09:00:00Z'),
}

async function buildApp() {
  const app = Fastify({ logger: false })
  await app.register(inventoryRouter, { prefix: '/inventory' })
  return app
}

describe('Inventory API', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    jest.clearAllMocks()

    // 기본 mock 반환값 설정
    getAvailableStock.mockReturnValue(4)
    getSellableStock.mockReturnValue(3)
    isStockCacheFresh.mockReturnValue(true)

    app = await buildApp()
  })

  afterEach(async () => {
    await app.close()
  })

  // ---- GET /inventory/status ----

  describe('GET /inventory/status', () => {
    it('재고 현황 목록 반환 → 200 + pagination', async () => {
      prisma.product.findMany.mockResolvedValue([mockProduct])
      prisma.product.count.mockResolvedValue(1)

      const res = await app.inject({ method: 'GET', url: '/inventory/status' })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.items).toHaveLength(1)
      expect(body.total).toBe(1)
      expect(body.page).toBe(1)
      expect(body.limit).toBe(20)
      expect(body.totalPages).toBe(1)
    })

    it('filter=low → cachedStock <= 2 필터 적용', async () => {
      prisma.product.findMany.mockResolvedValue([])
      prisma.product.count.mockResolvedValue(0)

      await app.inject({ method: 'GET', url: '/inventory/status?filter=low' })

      const whereArg = prisma.product.findMany.mock.calls[0][0].where
      expect(whereArg.cachedStock).toEqual({ lte: 2 })
    })

    it('filter=paused → listingPaused=true 필터 적용', async () => {
      prisma.product.findMany.mockResolvedValue([])
      prisma.product.count.mockResolvedValue(0)

      await app.inject({
        method: 'GET',
        url: '/inventory/status?filter=paused',
      })

      const whereArg = prisma.product.findMany.mock.calls[0][0].where
      expect(whereArg.listingPaused).toBe(true)
    })

    it('computed fields 포함 (availableStock, sellableStock, cacheFresh)', async () => {
      prisma.product.findMany.mockResolvedValue([mockProduct])
      prisma.product.count.mockResolvedValue(1)
      getAvailableStock.mockReturnValue(9)
      getSellableStock.mockReturnValue(7)
      isStockCacheFresh.mockReturnValue(false)

      const res = await app.inject({ method: 'GET', url: '/inventory/status' })
      const body = res.json()
      const item = body.items[0]

      expect(item.availableStock).toBe(9)
      expect(item.sellableStock).toBe(7)
      expect(item.cacheFresh).toBe(false)
      expect(getAvailableStock).toHaveBeenCalledWith(mockProduct)
      expect(getSellableStock).toHaveBeenCalledWith(mockProduct)
      expect(isStockCacheFresh).toHaveBeenCalledWith(
        mockProduct.lastStockSync,
      )
    })

    it('page=2&limit=5 → 올바른 pagination 파라미터 적용', async () => {
      prisma.product.findMany.mockResolvedValue([])
      prisma.product.count.mockResolvedValue(30)

      const res = await app.inject({
        method: 'GET',
        url: '/inventory/status?page=2&limit=5',
      })

      const body = res.json()
      expect(body.page).toBe(2)
      expect(body.limit).toBe(5)
      expect(body.totalPages).toBe(6)

      const findManyArgs = prisma.product.findMany.mock.calls[0][0]
      expect(findManyArgs.skip).toBe(5) // (2-1) * 5
      expect(findManyArgs.take).toBe(5)
    })
  })

  // ---- GET /inventory/:productId ----

  describe('GET /inventory/:productId', () => {
    it('상품 재고 상세 + 최근 이벤트 반환 → 200', async () => {
      prisma.product.findUnique.mockResolvedValue(mockProductDetail)
      prisma.inventoryEvent.findMany.mockResolvedValue([mockEvent])

      const res = await app.inject({
        method: 'GET',
        url: '/inventory/prod-1',
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.id).toBe('prod-1')
      expect(body.availableStock).toBe(4)
      expect(body.sellableStock).toBe(3)
      expect(body.cacheFresh).toBe(true)
      expect(body.recentEvents).toHaveLength(1)
      expect(body.recentEvents[0].id).toBe('evt-1')
    })

    it('존재하지 않는 상품 → 404', async () => {
      prisma.product.findUnique.mockResolvedValue(null)

      const res = await app.inject({
        method: 'GET',
        url: '/inventory/unknown-id',
      })

      expect(res.statusCode).toBe(404)
      expect(res.json().error).toBe('상품을 찾을 수 없습니다')
    })
  })

  // ---- POST /inventory/:productId/sync ----

  describe('POST /inventory/:productId/sync', () => {
    it('수동 동기화 큐 추가 → 200', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        source: 'domaegguk',
        sourceProductId: 'src-123',
      })

      const res = await app.inject({
        method: 'POST',
        url: '/inventory/prod-1/sync',
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().message).toBe('재고 동기화 큐에 추가됨')
      expect(res.json().productId).toBe('prod-1')
      expect(inventorySyncQueue.add).toHaveBeenCalledWith('manual-sync', {
        productId: 'prod-1',
        source: 'domaegguk',
        sourceProductId: 'src-123',
      })
    })

    it('존재하지 않는 상품 → 404', async () => {
      prisma.product.findUnique.mockResolvedValue(null)

      const res = await app.inject({
        method: 'POST',
        url: '/inventory/unknown-id/sync',
      })

      expect(res.statusCode).toBe(404)
      expect(res.json().error).toBe('상품을 찾을 수 없습니다')
    })
  })

  // ---- GET /inventory/events ----

  describe('GET /inventory/events', () => {
    it('이벤트 로그 반환 → 200 + pagination', async () => {
      const eventWithProduct = {
        ...mockEvent,
        product: { name: '테스트 상품' },
      }
      prisma.inventoryEvent.findMany.mockResolvedValue([eventWithProduct])
      prisma.inventoryEvent.count.mockResolvedValue(1)

      const res = await app.inject({
        method: 'GET',
        url: '/inventory/events',
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.items).toHaveLength(1)
      expect(body.total).toBe(1)
      expect(body.page).toBe(1)
      expect(body.limit).toBe(50)
    })

    it('type 필터 적용', async () => {
      prisma.inventoryEvent.findMany.mockResolvedValue([])
      prisma.inventoryEvent.count.mockResolvedValue(0)

      await app.inject({
        method: 'GET',
        url: '/inventory/events?type=sync',
      })

      const whereArg = prisma.inventoryEvent.findMany.mock.calls[0][0].where
      expect(whereArg.type).toBe('sync')
    })
  })

  // ---- POST /inventory/:productId/pause ----

  describe('POST /inventory/:productId/pause', () => {
    it('판매 중지 성공 → 200', async () => {
      pauseListing.mockResolvedValue({ ok: true })

      const res = await app.inject({
        method: 'POST',
        url: '/inventory/prod-1/pause',
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().message).toBe('판매 중지 완료')
      expect(res.json().productId).toBe('prod-1')
      expect(pauseListing).toHaveBeenCalledWith('prod-1', '수동 판매 중지')
    })

    it('판매 중지 실패 → 400', async () => {
      pauseListing.mockResolvedValue({
        ok: false,
        error: { message: '이미 중지된 상품입니다' },
      })

      const res = await app.inject({
        method: 'POST',
        url: '/inventory/prod-1/pause',
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toBe('이미 중지된 상품입니다')
    })
  })

  // ---- POST /inventory/:productId/resume ----

  describe('POST /inventory/:productId/resume', () => {
    it('판매 재개 성공 → 200', async () => {
      resumeListing.mockResolvedValue({ ok: true })

      const res = await app.inject({
        method: 'POST',
        url: '/inventory/prod-1/resume',
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().message).toBe('판매 재개 완료')
      expect(res.json().productId).toBe('prod-1')
      expect(resumeListing).toHaveBeenCalledWith('prod-1', '수동 판매 재개')
    })
  })
})
