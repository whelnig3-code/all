// =============================================
// 모니터링 관련 API 엔드포인트
// - 시스템 상태 확인
// - 작업 로그 조회
// - 큐 상태 조회
// =============================================

import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '@smartstore/db'
import {
  registrationQueue,
  orderQueue,
  shippingNotificationQueue,
  priceMonitorQueue,
} from '../queues'
import { naverCommerceApi } from '@smartstore/integrations'
import { notificationAdapter } from '@smartstore/adapters'

export const monitoringRouter: FastifyPluginAsync = async (fastify) => {
  // GET /monitoring/health - 시스템 헬스체크
  fastify.get('/health', async (request, reply) => {
    const [dbOk, naverOk, notificationOk] = await Promise.allSettled([
      prisma.$queryRaw`SELECT 1`,
      naverCommerceApi.healthCheck(),
      notificationAdapter.healthCheck(),
    ])

    const status = {
      database: dbOk.status === 'fulfilled' ? 'ok' : 'error',
      naver_api: naverOk.status === 'fulfilled' && naverOk.value ? 'ok' : 'error',
      notification: notificationOk.status === 'fulfilled' && notificationOk.value ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
    }

    // timestamp 필드를 제외한 3개 체크 항목만 'ok' 여부로 판정
    const allHealthy = [status.database, status.naver_api, status.notification].every(
      (v) => v === 'ok',
    )

    return reply
      .code(status.database === 'ok' ? 200 : 503)
      .send({ status: allHealthy ? 'healthy' : 'degraded', checks: status })
  })

  // GET /monitoring/queues - 큐 상태
  fastify.get('/queues', async (request, reply) => {
    const queues = [
      { name: '상품등록', queue: registrationQueue },
      { name: '주문처리', queue: orderQueue },
      { name: '배송알림', queue: shippingNotificationQueue },
      { name: '가격모니터', queue: priceMonitorQueue },
    ]

    const stats = await Promise.all(
      queues.map(async ({ name, queue }) => {
        const [waiting, active, completed, failed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
        ])

        return { name, waiting, active, completed, failed }
      })
    )

    return reply.send({ queues: stats })
  })

  // GET /monitoring/jobs - 작업 로그 조회
  fastify.get('/jobs', async (request, reply) => {
    const {
      type,
      status,
      page = '1',
      limit = '20',
    } = request.query as {
      type?: string
      status?: string
      page?: string
      limit?: string
    }

    const pageNum = parseInt(page, 10)
    const limitNum = Math.min(parseInt(limit, 10), 100)

    const [logs, total] = await Promise.all([
      prisma.jobLog.findMany({
        where: {
          ...(type ? { jobType: type } : {}),
          ...(status ? { status } : {}),
        },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { startedAt: 'desc' },
      }),
      prisma.jobLog.count({
        where: {
          ...(type ? { jobType: type } : {}),
          ...(status ? { status } : {}),
        },
      }),
    ])

    return reply.send({
      data: logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    })
  })

  // GET /monitoring/summary - 대시보드 요약
  fastify.get('/summary', async (request, reply) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [
      totalProducts,
      activeProducts,
      pendingProducts,
      todayOrders,
      todayRevenue,
      recentJobs,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { status: 'active' } }),
      prisma.product.count({ where: { status: 'pending' } }),
      prisma.order.count({ where: { orderedAt: { gte: today } } }),
      prisma.order.aggregate({
        where: {
          orderedAt: { gte: today },
          status: { in: ['shipped', 'delivered'] },
        },
        _sum: { totalAmount: true },
      }),
      prisma.jobLog.findMany({
        orderBy: { startedAt: 'desc' },
        take: 5,
        select: {
          jobType: true,
          status: true,
          startedAt: true,
          completedAt: true,
          error: true,
        },
      }),
    ])

    return reply.send({
      products: {
        total: totalProducts,
        active: activeProducts,
        pending: pendingProducts,
      },
      today: {
        orders: todayOrders,
        revenue: todayRevenue._sum.totalAmount ?? 0,
      },
      recentJobs,
      generatedAt: new Date().toISOString(),
    })
  })
}
