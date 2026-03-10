// =============================================
// 프로모션 (쿠폰·할인) API
// =============================================

import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '@smartstore/db'
import { verifyBasicAuth } from '../lib/auth'

export const promotionsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (req, reply) => {
    if (!verifyBasicAuth(req.headers['authorization'])) {
      return reply
        .code(401)
        .header('WWW-Authenticate', 'Basic realm="Smartstore Admin"')
        .send({ error: 'Unauthorized' })
    }
  })

  // GET /promotions — 프로모션 목록
  fastify.get('/', async (request, reply) => {
    const { active } = request.query as { active?: string }

    const now = new Date()
    const where = active === 'true'
      ? { isActive: true, startDate: { lte: now }, endDate: { gte: now } }
      : {}

    const promotions = await prisma.promotion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return reply.send({ promotions })
  })

  // GET /promotions/:id — 프로모션 상세
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const promotion = await prisma.promotion.findUnique({ where: { id } })
    if (!promotion) {
      return reply.code(404).send({ error: '프로모션을 찾을 수 없습니다' })
    }

    return reply.send({ promotion })
  })

  // POST /promotions — 프로모션 생성
  fastify.post('/', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const body = request.body as {
      name: string
      type: string
      value: number
      minOrderAmount?: number
      scope?: string
      targetIds?: string[]
      startDate: string
      endDate: string
      usageLimit?: number
      accountId?: string
    }

    if (!body.name || !body.type || body.value == null || !body.startDate || !body.endDate) {
      return reply.code(400).send({ error: 'name, type, value, startDate, endDate 필수' })
    }

    if (!['percentage', 'fixed_amount', 'free_shipping'].includes(body.type)) {
      return reply.code(400).send({ error: 'type은 percentage, fixed_amount, free_shipping 중 하나' })
    }

    if (body.type === 'percentage' && (body.value < 1 || body.value > 50)) {
      return reply.code(400).send({ error: '할인율은 1~50% 범위' })
    }

    const promotion = await prisma.promotion.create({
      data: {
        name: body.name,
        type: body.type,
        value: body.value,
        minOrderAmount: body.minOrderAmount ?? 0,
        scope: body.scope ?? 'all',
        targetIds: body.targetIds ?? [],
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        usageLimit: body.usageLimit ?? null,
        accountId: body.accountId ?? 'default',
      },
    })

    return reply.code(201).send({ promotion })
  })

  // PUT /promotions/:id — 프로모션 수정
  fastify.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const updates = request.body as Record<string, unknown>

    const existing = await prisma.promotion.findUnique({ where: { id } })
    if (!existing) {
      return reply.code(404).send({ error: '프로모션을 찾을 수 없습니다' })
    }

    // 날짜 문자열 → Date 변환
    const data: Record<string, unknown> = { ...updates }
    if (typeof data.startDate === 'string') data.startDate = new Date(data.startDate as string)
    if (typeof data.endDate === 'string') data.endDate = new Date(data.endDate as string)

    const promotion = await prisma.promotion.update({
      where: { id },
      data,
    })

    return reply.send({ promotion })
  })

  // DELETE /promotions/:id — 프로모션 삭제
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const existing = await prisma.promotion.findUnique({ where: { id } })
    if (!existing) {
      return reply.code(404).send({ error: '프로모션을 찾을 수 없습니다' })
    }

    await prisma.promotion.delete({ where: { id } })
    return reply.send({ message: '프로모션 삭제 완료' })
  })

  // POST /promotions/:id/toggle — 활성/비활성 토글
  fastify.post('/:id/toggle', async (request, reply) => {
    const { id } = request.params as { id: string }

    const existing = await prisma.promotion.findUnique({ where: { id } })
    if (!existing) {
      return reply.code(404).send({ error: '프로모션을 찾을 수 없습니다' })
    }

    const promotion = await prisma.promotion.update({
      where: { id },
      data: { isActive: !existing.isActive },
    })

    return reply.send({ promotion })
  })
}
