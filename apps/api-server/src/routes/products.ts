// =============================================
// 상품 관련 API 엔드포인트
// =============================================

import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '@smartstore/db'
import { calculateWholesalePrice } from '@smartstore/core'
import { registrationQueue } from '../queues'
import { createProductSchema } from '../schemas'

export const productsRouter: FastifyPluginAsync = async (fastify) => {
  // GET /products - 상품 목록 조회
  fastify.get('/', async (request, reply) => {
    const { status, page = '1', limit = '20' } = request.query as {
      status?: string
      page?: string
      limit?: string
    }

    const pageNum = parseInt(page, 10)
    const limitNum = Math.min(parseInt(limit, 10), 100)
    const skip = (pageNum - 1) * limitNum

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where: status ? { status } : undefined,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          source: true,
          status: true,
          salePrice: true,
          wholesalePrice: true,
          naverProductId: true,
          stockQuantity: true,
          registeredAt: true,
          createdAt: true,
        },
      }),
      prisma.product.count({ where: status ? { status } : undefined }),
    ])

    return reply.send({
      data: products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    })
  })

  // GET /products/:id - 상품 상세
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        priceHistory: {
          orderBy: { changedAt: 'desc' },
          take: 10,
        },
        competitorPrices: {
          orderBy: { checkedAt: 'desc' },
          take: 5,
        },
      },
    })

    if (!product) {
      return reply.code(404).send({ error: '상품을 찾을 수 없습니다' })
    }

    return reply.send(product)
  })

  // POST /products - 상품 수동 등록 큐에 추가
  fastify.post<{
    Body: {
      source: string
      sourceProductId: string
      name: string
      wholesalePrice: number
      shippingFee: number
      naverFeeRate: number
      targetMarginRate: number
      naverCategoryId?: string
      images: string[]
      description?: string
      stockQuantity?: number
    }
  }>('/', async (request, reply) => {
    // Zod 입력 검증
    const parsed = createProductSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: '입력 검증 실패',
        details: parsed.error.flatten().fieldErrors,
      })
    }
    const body = parsed.data

    // 가격 사전 계산 (안전장치 포함)
    let priceResult
    try {
      priceResult = calculateWholesalePrice({
        wholesalePrice: body.wholesalePrice,
        shippingFee: body.shippingFee,
        naverFeeRate: body.naverFeeRate,
        targetMarginRate: body.targetMarginRate,
      })
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : '가격 계산 실패',
      })
    }

    // DB에 상품 저장
    const product = await prisma.product.create({
      data: {
        uniqueKey: `${body.source}:${body.sourceProductId}`,
        sourceType: 'wholesale',
        source: body.source,
        sourceProductId: body.sourceProductId,
        name: body.name,
        wholesalePrice: body.wholesalePrice,
        shippingFee: body.shippingFee,
        salePrice: priceResult.salePrice,
        naverFeeRate: body.naverFeeRate,
        targetMarginRate: body.targetMarginRate,
        naverCategoryId: body.naverCategoryId,
        images: body.images,
        description: body.description,
        stockQuantity: body.stockQuantity ?? 999,
        category: body.source,
        status: 'pending',
      },
    })

    // 등록 큐에 추가
    await registrationQueue.add('register-product', { productId: product.id })

    return reply.code(201).send({
      product,
      priceCalculation: priceResult,
      message: '상품이 등록 큐에 추가되었습니다',
    })
  })

  // POST /products/:id/register - 특정 상품 즉시 등록 큐에 추가
  fastify.post('/:id/register', async (request, reply) => {
    const { id } = request.params as { id: string }

    const product = await prisma.product.findUnique({ where: { id } })

    if (!product) {
      return reply.code(404).send({ error: '상품을 찾을 수 없습니다' })
    }

    if (product.status !== 'pending') {
      return reply.code(400).send({
        error: `상품이 pending 상태가 아닙니다: ${product.status}`,
      })
    }

    await registrationQueue.add('register-product', { productId: id }, { priority: 1 })

    return reply.send({ message: '등록 큐에 추가되었습니다', productId: id })
  })

  // GET /products/:id/price-simulation - 가격 시뮬레이션
  fastify.get('/:id/price-simulation', async (request, reply) => {
    const { id } = request.params as { id: string }

    const product = await prisma.product.findUnique({
      where: { id },
      select: { wholesalePrice: true, shippingFee: true, naverFeeRate: true },
    })

    if (!product || !product.wholesalePrice || !product.shippingFee) {
      return reply.code(404).send({ error: '상품 정보 부족' })
    }

    const marginRates = [0.15, 0.20, 0.25, 0.30, 0.35, 0.40]
    const simulations = marginRates.map((rate) => {
      try {
        const result = calculateWholesalePrice({
          wholesalePrice: product.wholesalePrice!,
          shippingFee: product.shippingFee!,
          naverFeeRate: product.naverFeeRate,
          targetMarginRate: rate,
        })
        return { targetMarginRate: rate, ...result }
      } catch {
        return null
      }
    }).filter(Boolean)

    return reply.send({ simulations })
  })
}
