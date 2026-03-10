// =============================================
// 매출 리포트 API 라우터 단위 테스트
// Fastify inject() 방식으로 HTTP 계층 테스트
// =============================================

import Fastify from 'fastify'
import { reportRouter } from './report'

// @smartstore/db 모킹
jest.mock('@smartstore/db', () => ({
  prisma: {
    order: {
      groupBy: jest.fn(),
      aggregate: jest.fn(),
    },
    product: {
      findMany: jest.fn(),
    },
    priceHistory: {
      count: jest.fn(),
    },
  },
}))

import { prisma } from '@smartstore/db'

const mockOrderGroupBy   = prisma.order.groupBy   as jest.MockedFunction<typeof prisma.order.groupBy>
const mockOrderAggregate = prisma.order.aggregate as jest.MockedFunction<typeof prisma.order.aggregate>
const mockProductFindMany= prisma.product.findMany as jest.MockedFunction<typeof prisma.product.findMany>
const mockPriceHistoryCount = prisma.priceHistory.count as jest.MockedFunction<typeof prisma.priceHistory.count>

// =============================================
// 목 데이터 팩토리
// =============================================

/** groupBy revenueByAccount 응답 목 */
function mockRevenueByAccount() {
  return [
    {
      accountId: 'account1',
      _sum: { totalAmount: 500000, marginAmount: 150000 },
      _count: { id: 10 },
      _avg: { marginRate: 0.28 },
    },
  ]
}

/** groupBy topProducts 응답 목 */
function mockTopProductsRaw() {
  return [
    {
      productId: 'prod-1',
      _sum: { totalAmount: 200000, quantity: 8 },
      _count: { id: 4 },
    },
    {
      productId: 'prod-2',
      _sum: { totalAmount: 150000, quantity: 6 },
      _count: { id: 3 },
    },
  ]
}

/** product.findMany 응답 목 */
function mockProducts() {
  return [
    { id: 'prod-1', name: '스테인리스 렌치 세트', category: '공구/DIY' },
    { id: 'prod-2', name: '다용도 드라이버', category: '공구/DIY' },
  ]
}

/** order.aggregate marginStats 응답 목 */
function mockMarginStats() {
  return {
    _avg: { marginRate: 0.27 },
    _sum: { totalAmount: 500000, marginAmount: 135000 },
    _count: { id: 10 },
  }
}

/** Fastify 앱 빌드 헬퍼 */
async function buildApp() {
  const app = Fastify({ logger: false })
  await app.register(reportRouter, { prefix: '/report' })
  return app
}

// =============================================
// 테스트
// =============================================

describe('GET /report/revenue', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    jest.clearAllMocks()

    // 기본 목 설정
    mockOrderGroupBy
      .mockResolvedValueOnce(mockRevenueByAccount() as any) // 1차 호출: revenueByAccount
      .mockResolvedValueOnce(mockTopProductsRaw() as any)   // 2차 호출: topProductsRaw
    mockProductFindMany.mockResolvedValue(mockProducts() as any)
    mockOrderAggregate.mockResolvedValue(mockMarginStats() as any)
    mockPriceHistoryCount
      .mockResolvedValueOnce(3)  // competitorFallbackCount
      .mockResolvedValueOnce(10) // totalPriceAdjustments

    app = await buildApp()
  })

  afterEach(async () => {
    await app.close()
  })

  // ---- 정상 응답 형태 ----

  it('파라미터 없음 → 200 + 올바른 응답 형태', async () => {
    const res = await app.inject({ method: 'GET', url: '/report/revenue' })

    expect(res.statusCode).toBe(200)
    const body = res.json<{
      period: { since: string; until: string }
      revenueByAccount: unknown[]
      topProducts: unknown[]
      summary: {
        totalRevenue: number
        totalMargin: number
        totalOrders: number
        avgMarginRate: number | null
      }
      competitorFallback: { count: number; total: number; ratio: number }
    }>()

    expect(body.period).toBeDefined()
    expect(body.revenueByAccount).toBeDefined()
    expect(body.topProducts).toBeDefined()
    expect(body.summary).toBeDefined()
    expect(body.competitorFallback).toBeDefined()
  })

  it('period.since / period.until이 ISO 날짜 문자열', async () => {
    const res = await app.inject({ method: 'GET', url: '/report/revenue' })
    const body = res.json<{ period: { since: string; until: string } }>()

    expect(() => new Date(body.period.since)).not.toThrow()
    expect(isNaN(new Date(body.period.since).getTime())).toBe(false)
    expect(() => new Date(body.period.until)).not.toThrow()
  })

  it('revenueByAccount 배열에 accountId/totalRevenue/totalMargin/orderCount/avgMarginRate 포함', async () => {
    const res = await app.inject({ method: 'GET', url: '/report/revenue' })
    const body = res.json<{ revenueByAccount: { accountId: string; totalRevenue: number; avgMarginRate: number | null }[] }>()

    expect(Array.isArray(body.revenueByAccount)).toBe(true)
    expect(body.revenueByAccount[0]).toHaveProperty('accountId', 'account1')
    expect(body.revenueByAccount[0]).toHaveProperty('totalRevenue', 500000)
    expect(typeof body.revenueByAccount[0]!.avgMarginRate).toBe('number')
  })

  it('topProducts 배열에 productId/name/category/totalAmount/orderCount/totalQuantity 포함', async () => {
    const res = await app.inject({ method: 'GET', url: '/report/revenue' })
    const body = res.json<{
      topProducts: { productId: string; name: string; category: string; totalAmount: number }[]
    }>()

    expect(Array.isArray(body.topProducts)).toBe(true)
    const first = body.topProducts[0]!
    expect(first).toHaveProperty('productId', 'prod-1')
    expect(first).toHaveProperty('name', '스테인리스 렌치 세트')
    expect(first).toHaveProperty('category', '공구/DIY')
    expect(first).toHaveProperty('totalAmount', 200000)
    expect(first).toHaveProperty('orderCount')
    expect(first).toHaveProperty('totalQuantity')
  })

  it('삭제된 상품(productMap 미포함) → name이 "(삭제된 상품)"', async () => {
    // prod-2만 DB에 없는 경우
    mockProductFindMany.mockResolvedValueOnce([
      { id: 'prod-1', name: '스테인리스 렌치 세트', category: '공구/DIY' },
    ] as any)

    const res = await app.inject({ method: 'GET', url: '/report/revenue' })
    const body = res.json<{ topProducts: { productId: string; name: string }[] }>()

    const missing = body.topProducts.find((p) => p.productId === 'prod-2')
    expect(missing?.name).toBe('(삭제된 상품)')
  })

  it('summary.avgMarginRate가 소수점 1자리 %로 변환됨', async () => {
    const res = await app.inject({ method: 'GET', url: '/report/revenue' })
    const body = res.json<{ summary: { avgMarginRate: number | null } }>()

    // avgMarginRate: 0.27 → 27.0
    expect(body.summary.avgMarginRate).toBe(27.0)
  })

  it('summary.avgMarginRate가 null이면 null 반환', async () => {
    mockOrderAggregate.mockResolvedValueOnce({
      _avg: { marginRate: null },
      _sum: { totalAmount: 0, marginAmount: 0 },
      _count: { id: 0 },
    } as any)

    const res = await app.inject({ method: 'GET', url: '/report/revenue' })
    const body = res.json<{ summary: { avgMarginRate: number | null } }>()

    expect(body.summary.avgMarginRate).toBeNull()
  })

  it('competitorFallback.ratio = count/total × 100 (소수점 1자리)', async () => {
    const res = await app.inject({ method: 'GET', url: '/report/revenue' })
    const body = res.json<{ competitorFallback: { count: number; total: number; ratio: number } }>()

    // 3/10 = 30.0
    expect(body.competitorFallback.count).toBe(3)
    expect(body.competitorFallback.total).toBe(10)
    expect(body.competitorFallback.ratio).toBe(30.0)
  })

  it('priceHistory 0건이면 fallbackRatio = 0', async () => {
    mockPriceHistoryCount
      .mockReset()
      .mockResolvedValueOnce(0) // fallback
      .mockResolvedValueOnce(0) // total

    const res = await app.inject({ method: 'GET', url: '/report/revenue' })
    const body = res.json<{ competitorFallback: { ratio: number } }>()

    expect(body.competitorFallback.ratio).toBe(0)
  })

  // ---- since 파라미터 ----

  it('since 유효한 ISO 날짜 → 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/report/revenue?since=2026-01-01T00:00:00.000Z',
    })
    expect(res.statusCode).toBe(200)
  })

  it('since 유효하지 않은 날짜 → 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/report/revenue?since=not-a-date',
    })
    expect(res.statusCode).toBe(400)
    const body = res.json<{ error: string }>()
    expect(body.error).toContain('날짜 형식')
  })

  it('since "2026-13-99" 유효하지 않은 날짜 → 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/report/revenue?since=2026-13-99',
    })
    expect(res.statusCode).toBe(400)
  })

  // ---- accountId 파라미터 ----

  it('accountId 100자 이하 → 200', async () => {
    const validId = 'a'.repeat(100)
    const res = await app.inject({
      method: 'GET',
      url: `/report/revenue?accountId=${validId}`,
    })
    expect(res.statusCode).toBe(200)
  })

  it('accountId 101자 이상 → 400', async () => {
    const longId = 'a'.repeat(101)
    const res = await app.inject({
      method: 'GET',
      url: `/report/revenue?accountId=${longId}`,
    })
    expect(res.statusCode).toBe(400)
    const body = res.json<{ error: string }>()
    expect(body.error).toContain('accountId')
  })

  // ---- DB 오류 ----

  it('DB 오류 시 → 500', async () => {
    mockOrderGroupBy.mockReset()
    mockOrderGroupBy.mockRejectedValue(new Error('DB 연결 실패'))

    const res = await app.inject({ method: 'GET', url: '/report/revenue' })
    expect(res.statusCode).toBe(500)
    const body = res.json<{ error: string }>()
    expect(body.error).toBe('리포트 조회 실패')
  })
})
