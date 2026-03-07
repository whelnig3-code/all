// =============================================
// 재고 관리 API 라우트
// =============================================

import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '@smartstore/db'
import {
  getAvailableStock,
  getSellableStock,
  isStockCacheFresh,
  pauseListing,
  resumeListing,
} from '@smartstore/core'
import { inventorySyncQueue } from '../queues'

export const inventoryRouter: FastifyPluginAsync = async (fastify) => {
  // GET /inventory/status — 전체 재고 현황
  fastify.get('/status', async (request) => {
    const { page = '1', limit = '20', filter } = request.query as {
      page?: string
      limit?: string
      filter?: 'low' | 'paused' | 'all'
    }

    const pageNum = Math.max(parseInt(page, 10), 1)
    const limitNum = Math.min(Math.max(parseInt(limit, 10), 1), 100)

    const where: Record<string, unknown> = {
      status: { in: ['active', 'registered', 'suspended'] },
    }

    if (filter === 'low') {
      where['cachedStock'] = { lte: 2 }
    } else if (filter === 'paused') {
      where['listingPaused'] = true
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        select: {
          id: true,
          name: true,
          source: true,
          supplierStock: true,
          cachedStock: true,
          reservedStock: true,
          lastStockSync: true,
          listingPaused: true,
          status: true,
        },
        orderBy: { cachedStock: 'asc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.product.count({ where }),
    ])

    return {
      items: products.map((p) => ({
        ...p,
        availableStock: getAvailableStock(p),
        sellableStock: getSellableStock(p),
        cacheFresh: isStockCacheFresh(p.lastStockSync),
      })),
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    }
  })

  // GET /inventory/:productId — 단일 상품 재고 상세
  fastify.get('/:productId', async (request, reply) => {
    const { productId } = request.params as { productId: string }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        source: true,
        supplierStock: true,
        cachedStock: true,
        reservedStock: true,
        lastStockSync: true,
        listingPaused: true,
        listingPausedAt: true,
        status: true,
      },
    })

    if (!product) {
      return reply.code(404).send({ error: '상품을 찾을 수 없습니다' })
    }

    const recentEvents = await prisma.inventoryEvent.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    return {
      ...product,
      availableStock: getAvailableStock(product),
      sellableStock: getSellableStock(product),
      cacheFresh: isStockCacheFresh(product.lastStockSync),
      recentEvents,
    }
  })

  // POST /inventory/:productId/sync — 수동 재고 동기화
  fastify.post('/:productId/sync', async (request, reply) => {
    const { productId } = request.params as { productId: string }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, source: true, sourceProductId: true },
    })

    if (!product) {
      return reply.code(404).send({ error: '상품을 찾을 수 없습니다' })
    }

    await inventorySyncQueue.add('manual-sync', {
      productId: product.id,
      source: product.source,
      sourceProductId: product.sourceProductId,
    })

    return { message: '재고 동기화 큐에 추가됨', productId }
  })

  // GET /inventory/events — 재고 이벤트 로그
  fastify.get('/events', async (request) => {
    const { page = '1', limit = '50', type, productId } = request.query as {
      page?: string
      limit?: string
      type?: string
      productId?: string
    }

    const pageNum = Math.max(parseInt(page, 10), 1)
    const limitNum = Math.min(Math.max(parseInt(limit, 10), 1), 100)

    const where: Record<string, unknown> = {}
    if (type) where['type'] = type
    if (productId) where['productId'] = productId

    const [events, total] = await Promise.all([
      prisma.inventoryEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        include: {
          product: { select: { name: true } },
        },
      }),
      prisma.inventoryEvent.count({ where }),
    ])

    return {
      items: events,
      total,
      page: pageNum,
      limit: limitNum,
    }
  })

  // POST /inventory/:productId/pause — 수동 판매 중지
  fastify.post('/:productId/pause', async (request, reply) => {
    const { productId } = request.params as { productId: string }

    const result = await pauseListing(productId, '수동 판매 중지')

    if (!result.ok) {
      return reply.code(400).send({ error: result.error.message })
    }

    return { message: '판매 중지 완료', productId }
  })

  // POST /inventory/:productId/resume — 수동 판매 재개
  fastify.post('/:productId/resume', async (request, reply) => {
    const { productId } = request.params as { productId: string }

    const result = await resumeListing(productId, '수동 판매 재개')

    if (!result.ok) {
      return reply.code(400).send({ error: result.error.message })
    }

    return { message: '판매 재개 완료', productId }
  })
}
