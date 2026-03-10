// =============================================
// 매출 리포트 API
// - accountId별 매출 집계
// - 상위 10개 상품 (판매액 기준)
// - marginRate 평균
// - Competitor fallback 비율
// =============================================

import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '@smartstore/db'
import { verifyBasicAuth } from '../lib/auth'

export const reportRouter: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (req, reply) => {
    if (!verifyBasicAuth(req.headers['authorization'])) {
      return reply
        .code(401)
        .header('WWW-Authenticate', 'Basic realm="Smartstore Admin"')
        .send({ error: 'Unauthorized' })
    }
  })
  // GET /report/revenue - 매출 리포트
  fastify.get('/revenue', async (request, reply) => {
    const query = request.query as {
      since?: string // ISO 날짜 (기본: 30일 전)
      accountId?: string
    }

    let since: Date
    if (query.since) {
      const parsed = new Date(query.since)
      if (isNaN(parsed.getTime())) {
        return reply.code(400).send({ error: '유효하지 않은 날짜 형식: since (ISO 8601 필요)' })
      }
      since = parsed
    } else {
      since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    }

    // accountId 길이 제한 (SQL injection 방어 — Prisma parameterized 쿼리 사용 중이나 추가 검증)
    if (query.accountId && query.accountId.length > 100) {
      return reply.code(400).send({ error: 'accountId가 너무 깁니다' })
    }

    try {
      // 1. accountId별 매출 집계
      const revenueByAccount = await prisma.order.groupBy({
        by: ['accountId'],
        where: {
          orderedAt: { gte: since },
          status: { notIn: ['CANCELLED'] },
        },
        _sum: { totalAmount: true, marginAmount: true },
        _count: { id: true },
        _avg: { marginRate: true },
        orderBy: { _sum: { totalAmount: 'desc' } },
      })

      // 2. 상위 10개 상품 (판매액 기준)
      const topProductsRaw = await prisma.order.groupBy({
        by: ['productId'],
        where: {
          orderedAt: { gte: since },
          status: { notIn: ['CANCELLED'] },
          ...(query.accountId ? { accountId: query.accountId } : {}),
        },
        _sum: { totalAmount: true, quantity: true },
        _count: { id: true },
        orderBy: { _sum: { totalAmount: 'desc' } },
        take: 10,
      })

      // 상품명 조회 (productId → name 매핑)
      const productIds = topProductsRaw.map((r) => r.productId)
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, category: true },
      })
      const productMap = new Map(products.map((p) => [p.id, p]))

      const topProducts = topProductsRaw.map((r) => ({
        productId: r.productId,
        name: productMap.get(r.productId)?.name ?? '(삭제된 상품)',
        category: productMap.get(r.productId)?.category ?? '',
        totalAmount: r._sum.totalAmount ?? 0,
        orderCount: r._count.id,
        totalQuantity: r._sum.quantity ?? 0,
      }))

      // 3. 전체 marginRate 평균 (accountId 필터 적용)
      const marginStats = await prisma.order.aggregate({
        where: {
          orderedAt: { gte: since },
          status: { notIn: ['CANCELLED'] },
          marginRate: { not: null },
          ...(query.accountId ? { accountId: query.accountId } : {}),
        },
        _avg: { marginRate: true },
        _sum: { totalAmount: true, marginAmount: true },
        _count: { id: true },
      })

      // 4. Competitor fallback 비율 (PriceHistory.reason 기반)
      const [competitorFallbackCount, totalPriceAdjustments] = await Promise.all([
        // '경쟁가' 기반 조정 = competitor fallback
        prisma.priceHistory.count({
          where: {
            changedAt: { gte: since },
            reason: { contains: '경쟁가' },
          },
        }),
        prisma.priceHistory.count({
          where: { changedAt: { gte: since } },
        }),
      ])

      const fallbackRatio = totalPriceAdjustments > 0
        ? competitorFallbackCount / totalPriceAdjustments
        : 0

      return reply.send({
        period: {
          since: since.toISOString(),
          until: new Date().toISOString(),
        },
        revenueByAccount: revenueByAccount.map((r) => ({
          accountId: r.accountId,
          totalRevenue: r._sum.totalAmount ?? 0,
          totalMargin: r._sum.marginAmount ?? 0,
          orderCount: r._count.id,
          avgMarginRate: r._avg.marginRate
            ? parseFloat((r._avg.marginRate * 100).toFixed(1))
            : null,
        })),
        topProducts,
        summary: {
          totalRevenue: marginStats._sum.totalAmount ?? 0,
          totalMargin: marginStats._sum.marginAmount ?? 0,
          totalOrders: marginStats._count.id,
          avgMarginRate: marginStats._avg.marginRate
            ? parseFloat((marginStats._avg.marginRate * 100).toFixed(1))
            : null,
        },
        competitorFallback: {
          count: competitorFallbackCount,
          total: totalPriceAdjustments,
          ratio: parseFloat((fallbackRatio * 100).toFixed(1)),
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return reply.code(500).send({ error: '리포트 조회 실패', detail: message })
    }
  })
}
