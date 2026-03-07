// =============================================
// 주문 관련 API 엔드포인트
// =============================================

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '@smartstore/db'
import { approveOrder, rejectOrder } from '@smartstore/core'
import { orderQueue, shippingNotificationQueue } from '../queues'
import type { ShippingNotificationJobData } from '../queues'

/** Basic Auth 검증 (admin.ts와 동일 로직) */
function verifyBasicAuth(authHeader: string | undefined): boolean {
  if (!authHeader?.startsWith('Basic ')) return false
  try {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8')
    const colonIdx = decoded.indexOf(':')
    if (colonIdx === -1) return false
    const user = decoded.slice(0, colonIdx)
    const pass = decoded.slice(colonIdx + 1)
    return (
      user === process.env['ADMIN_USER'] &&
      pass === process.env['ADMIN_PASS']
    )
  } catch {
    return false
  }
}

/** 승인/거부 엔드포인트용 인증 훅 */
async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!verifyBasicAuth(req.headers['authorization'])) {
    reply
      .code(401)
      .header('WWW-Authenticate', 'Basic realm="Smartstore Orders"')
      .send({ error: 'Unauthorized' })
  }
}

export const ordersRouter: FastifyPluginAsync = async (fastify) => {
  // GET /orders - 주문 목록
  fastify.get('/', async (request, reply) => {
    const {
      status,
      page = '1',
      limit = '20',
      from,
      to,
    } = request.query as {
      status?: string
      page?: string
      limit?: string
      from?: string
      to?: string
    }

    const pageNum = parseInt(page, 10)
    const limitNum = Math.min(parseInt(limit, 10), 100)

    const where = {
      ...(status ? { status } : {}),
      ...(from || to
        ? {
            orderedAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { orderedAt: 'desc' },
        include: {
          product: { select: { name: true, source: true } },
        },
      }),
      prisma.order.count({ where }),
    ])

    return reply.send({
      data: orders,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    })
  })

  // GET /orders/:id - 주문 상세
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        product: true,
      },
    })

    if (!order) {
      return reply.code(404).send({ error: '주문을 찾을 수 없습니다' })
    }

    return reply.send(order)
  })

  // POST /orders/poll - 수동 주문 폴링 트리거
  fastify.post('/poll', async (request, reply) => {
    await orderQueue.add('poll-orders', { trigger: 'manual', naverOrderId: 'poll' })
    return reply.send({ message: '주문 폴링이 트리거되었습니다' })
  })

  // POST /orders/:id/ship - 발송 처리
  fastify.post<{
    Params: { id: string }
    Body: {
      trackingNumber: string
      courier: string
    }
  }>('/:id/ship', async (request, reply) => {
    const { id } = request.params
    const { trackingNumber, courier } = request.body

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        product: { select: { name: true } },
      },
    })

    if (!order) {
      return reply.code(404).send({ error: '주문을 찾을 수 없습니다' })
    }

    if (order.status !== 'preparing' && order.status !== 'paid') {
      return reply.code(400).send({
        error: `발송 처리 불가 상태: ${order.status}`,
      })
    }

    // 주문 상태 preparing으로 변경 (발송 처리 전 단계)
    await prisma.order.update({
      where: { id },
      data: { status: 'preparing', trackingNumber, courier },
    })

    // 발송 알림 큐에 추가
    const jobData: ShippingNotificationJobData = {
      orderId: id,
      productOrderId: order.naverOrderId,
      trackingNumber,
      courier,
      customerName: order.customerName,
      productName: order.product.name,
    }

    await shippingNotificationQueue.add('notify-shipping', jobData, { priority: 1 })

    return reply.send({
      message: '발송 처리가 시작되었습니다',
      orderId: id,
      trackingNumber,
    })
  })

  // POST /orders/:orderId/approve — 주문 승인 (Phase 4.5, Basic Auth 필수)
  fastify.post('/:orderId/approve', { onRequest: requireAuth }, async (request, reply) => {
    const { orderId } = request.params as { orderId: string }
    const { approvalToken } = request.body as { approvalToken: string }

    if (!approvalToken) {
      return reply.code(400).send({ error: 'approvalToken 필수' })
    }

    const result = await approveOrder(orderId, approvalToken)

    if (!result.ok) {
      return reply.code(400).send({ error: result.error.message })
    }

    return { message: '주문 승인 완료', orderId }
  })

  // POST /orders/:orderId/reject — 주문 거부 (Phase 4.5, Basic Auth 필수)
  fastify.post('/:orderId/reject', { onRequest: requireAuth }, async (request, reply) => {
    const { orderId } = request.params as { orderId: string }
    const { approvalToken, reason } = request.body as {
      approvalToken: string
      reason?: string
    }

    if (!approvalToken) {
      return reply.code(400).send({ error: 'approvalToken 필수' })
    }

    const result = await rejectOrder(orderId, approvalToken, reason)

    if (!result.ok) {
      return reply.code(400).send({ error: result.error.message })
    }

    return { message: '주문 거부 완료', orderId }
  })

  // GET /orders/pending-approvals — 대기 중 승인 요청 목록 (Phase 4.5, Basic Auth 필수)
  fastify.get('/pending-approvals', { onRequest: requireAuth }, async () => {
    const approvals = await prisma.orderApproval.findMany({
      where: { status: 'pending' },
      include: {
        order: {
          include: {
            product: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return {
      items: approvals.map((a) => ({
        orderId: a.orderId,
        product: a.order.product.name,
        salePrice: a.order.salePrice,
        marginRate: a.marginRate,
        expiresAt: a.expiresAt.toISOString(),
        createdAt: a.createdAt.toISOString(),
      })),
    }
  })

  // GET /orders/stats - 주문 통계
  fastify.get('/stats', async (request, reply) => {
    const { from, to } = request.query as { from?: string; to?: string }

    const dateFilter = from || to ? {
      orderedAt: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      },
    } : {}

    const [statusCounts, totalRevenue] = await Promise.all([
      // 상태별 주문 수
      prisma.order.groupBy({
        by: ['status'],
        _count: true,
        where: dateFilter,
      }),
      // 총 매출
      prisma.order.aggregate({
        where: {
          ...dateFilter,
          status: { in: ['shipped', 'delivered'] },
        },
        _sum: { totalAmount: true },
        _count: true,
      }),
    ])

    return reply.send({
      statusBreakdown: statusCounts.reduce((acc, item) => {
        acc[item.status] = item._count
        return acc
      }, {} as Record<string, number>),
      revenue: {
        total: totalRevenue._sum.totalAmount ?? 0,
        orderCount: totalRevenue._count,
      },
    })
  })
}
