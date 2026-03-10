// =============================================
// 모니터링 관련 API 엔드포인트
// - 시스템 상태 확인
// - 작업 로그 조회
// - 큐 상태 조회
// =============================================

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '@smartstore/db'
import {
  registrationQueue,
  orderQueue,
  shippingNotificationQueue,
  priceMonitorQueue,
} from '../queues'
import { naverCommerceApi } from '@smartstore/integrations'
import { notificationAdapter } from '@smartstore/adapters'
import { verifyBasicAuth } from '../lib/auth'

async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!verifyBasicAuth(req.headers['authorization'])) {
    reply
      .code(401)
      .header('WWW-Authenticate', 'Basic realm="Smartstore Admin"')
      .send({ error: 'Unauthorized' })
  }
}

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
  fastify.get('/queues', { onRequest: requireAuth }, async (request, reply) => {
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
  fastify.get('/jobs', { onRequest: requireAuth }, async (request, reply) => {
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
  fastify.get('/summary', { onRequest: requireAuth }, async (request, reply) => {
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

  // GET /monitoring/alerts - 최근 알림 (실패/경고)
  fastify.get('/alerts', { onRequest: requireAuth }, async (request, reply) => {
    const { since } = request.query as { since?: string }
    const sinceDate = since ? new Date(since) : new Date(Date.now() - 24 * 60 * 60 * 1000)

    const [failedJobs, suspendedProducts] = await Promise.all([
      prisma.jobLog.findMany({
        where: {
          status: 'failed',
          startedAt: { gte: sinceDate },
        },
        orderBy: { startedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          jobType: true,
          error: true,
          startedAt: true,
        },
      }),
      prisma.product.count({
        where: {
          status: 'suspended',
          updatedAt: { gte: sinceDate },
        },
      }),
    ])

    const alerts: Array<{ id: string; type: string; severity: string; message: string; timestamp: string }> = failedJobs.map(job => ({
      id: job.id,
      type: 'job_failed',
      severity: 'error',
      message: `${job.jobType} 작업 실패`,
      timestamp: job.startedAt?.toISOString() ?? new Date().toISOString(),
    }))

    if (suspendedProducts > 0) {
      alerts.unshift({
        id: 'suspended-alert',
        type: 'product_suspended',
        severity: 'warning',
        message: `${suspendedProducts}개 상품 일시정지됨`,
        timestamp: new Date().toISOString(),
      })
    }

    return reply.send({ alerts, total: alerts.length })
  })
}
