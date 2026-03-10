// =============================================
// 상품 관련 API 엔드포인트
// =============================================

import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '@smartstore/db'
import { calculateWholesalePrice, buildBlogPostWithSections } from '@smartstore/core'
import { registrationQueue } from '../queues'
import { createProductSchema } from '../schemas'
import { verifyBasicAuth } from '../lib/auth'

export const productsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (req, reply) => {
    if (!verifyBasicAuth(req.headers['authorization'])) {
      return reply
        .code(401)
        .header('WWW-Authenticate', 'Basic realm="Smartstore Admin"')
        .send({ error: 'Unauthorized' })
    }
  })
  // GET /products - 상품 목록 조회
  fastify.get('/', async (request, reply) => {
    const { status, nicheCategory, search, sort, page = '1', limit = '20' } = request.query as {
      status?: string
      nicheCategory?: string
      search?: string
      sort?: string
      page?: string
      limit?: string
    }

    const pageNum = parseInt(page, 10)
    const limitNum = Math.min(parseInt(limit, 10), 100)
    const skip = (pageNum - 1) * limitNum

    const where = {
      ...(status ? { status } : {}),
      ...(nicheCategory ? { nicheCategory } : {}),
      ...(search ? { name: { contains: search } } : {}),
    }

    // 정렬: createdAt_desc (기본), salePrice_asc, salePrice_desc, name_asc
    let orderBy: Record<string, string> = { createdAt: 'desc' }
    if (sort) {
      const [field, dir] = sort.split('_')
      if (field && dir && ['createdAt', 'salePrice', 'name', 'wholesalePrice'].includes(field)) {
        orderBy = { [field]: dir === 'asc' ? 'asc' : 'desc' }
      }
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where: Object.keys(where).length > 0 ? where : undefined,
        skip,
        take: limitNum,
        orderBy,
        select: {
          id: true,
          name: true,
          source: true,
          status: true,
          salePrice: true,
          wholesalePrice: true,
          naverProductId: true,
          stockQuantity: true,
          nicheCategory: true,
          registeredAt: true,
          createdAt: true,
        },
      }),
      prisma.product.count({ where: Object.keys(where).length > 0 ? where : undefined }),
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

  // POST /products - 상품 수동 등록 큐에 추가 (분당 20회)
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
  }>('/', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
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
  fastify.post('/:id/register', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
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

  // POST /products/bulk-register - 일괄 등록 큐에 추가
  fastify.post('/bulk-register', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { productIds } = request.body as { productIds: string[] }

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return reply.code(400).send({ error: '상품 ID 목록이 필요합니다' })
    }

    if (productIds.length > 50) {
      return reply.code(400).send({ error: '한번에 최대 50개까지 가능합니다' })
    }

    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, status: 'pending' },
      select: { id: true },
    })

    const jobs = products.map(p => ({
      name: 'register-product',
      data: { productId: p.id },
      opts: { priority: 2 },
    }))

    if (jobs.length > 0) {
      await registrationQueue.addBulk(jobs)
    }

    return reply.send({
      message: `${jobs.length}개 상품이 등록 큐에 추가되었습니다`,
      queued: jobs.length,
      skipped: productIds.length - jobs.length,
    })
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

  // GET /products/:id/blog — 블로그 글 조회 (저장된 값 또는 실시간 생성)
  fastify.get('/:id/blog', async (request, reply) => {
    const { id } = request.params as { id: string }

    const product = await prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        category: true,
        salePrice: true,
        description: true,
        generatedDescription: true,
        blogTitle: true,
        blogContent: true,
        blogTags: true,
        blogGeneratedAt: true,
      },
    })

    if (!product) {
      return reply.code(404).send({ error: '상품을 찾을 수 없습니다' })
    }

    // 항상 최신 상품 정보로 블로그 글 생성 (sections/plainText 일관성 보장)
    const hasCached = !!(product.blogTitle && product.blogContent)
    const blogPost = buildBlogPostWithSections({
      productName: product.name,
      category: product.category,
      salePrice: product.salePrice,
      description: product.generatedDescription ?? product.description ?? undefined,
    })

    // DB에 저장 (최초 생성 또는 갱신)
    if (!hasCached) {
      await prisma.product.update({
        where: { id },
        data: {
          blogTitle: blogPost.title,
          blogContent: blogPost.body,
          blogTags: blogPost.tags,
          blogGeneratedAt: new Date(),
        },
      })
    }

    return reply.send({
      productId: product.id,
      title: blogPost.title,
      body: blogPost.body,
      tags: blogPost.tags,
      sections: blogPost.sections,
      plainText: blogPost.plainText,
      generatedAt: hasCached ? product.blogGeneratedAt : new Date().toISOString(),
      source: hasCached ? 'cached' : 'generated',
    })
  })
}
