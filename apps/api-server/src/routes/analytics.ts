// =============================================
// 분석 관련 API 엔드포인트 (Phase C)
// - 등록 거부 분석
// - 니치 상품 분석
// - SEO 미리보기
// =============================================

import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '@smartstore/db'
import {
  analyzeRejections,
  isNicheProduct,
  calculateNicheScore,
  classifyNicheCategory,
  optimizeProductTitle,
  generateSearchTags,
  buildBlogPostFromTemplate,
  NICHE_CATEGORIES,
} from '@smartstore/core'

/**
 * 등록 거부 분석 (DB 조회 + core 분석기)
 */
export async function getRejectionAnalysis(days: number) {
  const since = new Date()
  since.setDate(since.getDate() - days)

  const logs = await prisma.jobLog.findMany({
    where: {
      jobType: 'registration',
      startedAt: { gte: since },
    },
    select: {
      id: true,
      jobType: true,
      status: true,
      result: true,
      createdAt: true,
    },
  })

  // Prisma Json → JobLogEntry 변환
  const entries = logs.map((log) => ({
    id: log.id,
    jobType: log.jobType,
    status: log.status,
    result: (log.result as Record<string, unknown>) ?? {},
    createdAt: log.createdAt,
  }))

  return analyzeRejections(entries)
}

/**
 * 니치 상품 분석 (순수 함수)
 */
export function getNicheAnalysis(productName: string, wholesalePrice: number, category?: string) {
  return {
    isNiche: isNicheProduct(productName),
    score: calculateNicheScore({ productName, wholesalePrice, category }),
    productName,
    wholesalePrice,
  }
}

/**
 * SEO 미리보기 (순수 함수)
 */
export function getSeoPreview(originalName: string, category?: string) {
  const optimizedName = optimizeProductTitle({ originalName, category })
  const searchTags = generateSearchTags(originalName)

  return {
    originalName,
    optimizedName,
    searchTags,
    originalLength: originalName.length,
    optimizedLength: optimizedName.length,
  }
}

/**
 * Analytics 라우터
 */
export const analyticsRouter: FastifyPluginAsync = async (fastify) => {
  // GET /analytics/rejections?days=7
  fastify.get('/rejections', async (request, reply) => {
    const { days = '7' } = request.query as { days?: string }
    const daysNum = Math.min(parseInt(days, 10) || 7, 90)

    const analysis = await getRejectionAnalysis(daysNum)
    return reply.send({ days: daysNum, ...analysis })
  })

  // GET /analytics/niche?name=...&price=...
  fastify.get('/niche', async (request, reply) => {
    const { name, price, category } = request.query as {
      name?: string
      price?: string
      category?: string
    }

    if (!name || !price) {
      return reply.code(400).send({ error: 'name, price 파라미터 필수' })
    }

    const wholesalePrice = parseInt(price, 10)
    if (isNaN(wholesalePrice) || wholesalePrice < 0) {
      return reply.code(400).send({ error: 'price는 0 이상 정수' })
    }

    const analysis = getNicheAnalysis(name, wholesalePrice, category)
    return reply.send(analysis)
  })

  // GET /analytics/seo-preview?name=...
  fastify.get('/seo-preview', async (request, reply) => {
    const { name, category } = request.query as { name?: string; category?: string }

    if (!name) {
      return reply.code(400).send({ error: 'name 파라미터 필수' })
    }

    const preview = getSeoPreview(name, category)
    return reply.send(preview)
  })

  // GET /analytics/blog-preview?name=...&price=...&category=...
  fastify.get('/blog-preview', async (request, reply) => {
    const { name, price, category, description } = request.query as {
      name?: string
      price?: string
      category?: string
      description?: string
    }

    if (!name || !price) {
      return reply.code(400).send({ error: 'name, price 파라미터 필수' })
    }

    const salePrice = parseInt(price, 10)
    if (isNaN(salePrice) || salePrice < 0) {
      return reply.code(400).send({ error: 'price는 0 이상 정수' })
    }

    const nicheCategory = classifyNicheCategory(name)
    const blogPost = buildBlogPostFromTemplate({
      productName: name,
      category: category ?? nicheCategory,
      salePrice,
      description,
    })

    return reply.send({
      nicheCategory,
      ...blogPost,
    })
  })

  // GET /analytics/categories — 사용 가능한 니치 카테고리 목록
  fastify.get('/categories', async (request, reply) => {
    const categories = NICHE_CATEGORIES.map((c) => ({
      name: c.name,
      keywords: c.keywords,
    }))

    // DB에서 카테고리별 상품 수
    const counts = await prisma.product.groupBy({
      by: ['nicheCategory'],
      _count: { id: true },
      where: { nicheCategory: { not: null } },
    })

    const countMap = new Map(counts.map((c) => [c.nicheCategory, c._count.id]))

    return reply.send({
      categories: [
        ...categories.map((c) => ({
          ...c,
          productCount: countMap.get(c.name) ?? 0,
        })),
        { name: '기타', keywords: [], productCount: countMap.get('기타') ?? 0 },
      ],
    })
  })
}
