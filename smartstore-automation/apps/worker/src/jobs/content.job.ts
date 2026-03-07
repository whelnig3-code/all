// =============================================
// 상품 콘텐츠 자동 생성 작업 (Phase 3)
//
// 흐름:
//   1. DB에서 상품 정보 조회 (원문 설명 + 카테고리)
//   2. LLM으로 최적화된 상품 설명 생성
//   3. DB에 생성된 설명 저장 (generatedDescription 컬럼)
//   4. 네이버에 상품 설명 업데이트 (naverCommerceApi)
//   5. 알림 전송
// =============================================

import { Worker, Job, Queue } from 'bullmq'
import { createLogger } from '@smartstore/shared'
import { generateProductDescription } from '@smartstore/core'
import { llmAdapter } from '@smartstore/adapters'
import { updateProductDescription } from '@smartstore/integrations'
import { notificationAdapter } from '@smartstore/adapters'
import { prisma } from '@smartstore/db'
import { QUEUE_NAMES, redisConnection, type ContentJobData } from '../queues'

const logger = createLogger('content-job')

/**
 * 콘텐츠 생성 워커
 * - LLM으로 상품 설명 자동 생성
 */
export function createContentWorker(): Worker {
  const worker = new Worker<ContentJobData>(
    QUEUE_NAMES.CONTENT_GENERATION,
    async (job: Job<ContentJobData>) => {
      const { productId } = job.data
      logger.info(`콘텐츠 생성 시작: ${productId}`, { jobId: job.id })

      const jobLog = await prisma.jobLog.create({
        data: {
          jobType: 'content_generation',
          jobId: job.id ?? '',
          status: 'started',
          payload: { productId },
          startedAt: new Date(),
        },
      })

      try {
        // 1. 상품 정보 조회
        const product = await prisma.product.findUnique({
          where: { id: productId },
        })

        if (!product) {
          throw new Error(`상품을 찾을 수 없습니다: ${productId}`)
        }

        if (!product.rawDescription) {
          logger.info('원문 설명 없음, 콘텐츠 생성 건너뜀', { productId })
          await prisma.jobLog.update({
            where: { id: jobLog.id },
            data: {
              status: 'completed',
              result: { skipped: true, reason: 'rawDescription 없음' },
              completedAt: new Date(),
            },
          })
          return { skipped: true }
        }

        // 2. LLM으로 상품 설명 생성
        const descriptionResult = await generateProductDescription(
          {
            productName: product.name,
            rawDescription: product.rawDescription,
            categoryName: product.categoryName ?? undefined,
            salePrice: product.salePrice,
          },
          llmAdapter
        )

        // 3. 생성된 설명 DB 저장
        const generatedText = [
          descriptionResult.highlights.map((h) => `• ${h}`).join('\n'),
          '',
          descriptionResult.detailDescription,
          '',
          descriptionResult.cautions,
        ]
          .join('\n')
          .trim()

        await prisma.product.update({
          where: { id: productId },
          data: {
            generatedDescription: generatedText,
            descriptionGeneratedAt: new Date(),
            descriptionModel: descriptionResult.generatedBy,
          },
        })

        // 4. 네이버 상품 설명 업데이트 (naverProductId가 있는 경우)
        if (product.naverProductId) {
          const originProductNo = parseInt(product.naverProductId, 10)
          const updated = await updateProductDescription(originProductNo, generatedText)

          if (!updated) {
            logger.warn('네이버 상품 설명 업데이트 실패 (DB만 저장됨)', { productId })
          }
        }

        // 5. 알림
        await notificationAdapter.send({
          type: 'content_generated',
          title: '상품 설명 자동 생성 완료',
          message: [
            `상품: ${product.name}`,
            `핵심특징: ${descriptionResult.highlights.length}개`,
            `생성 모델: ${descriptionResult.generatedBy}`,
          ].join('\n'),
          data: { productId },
        })

        await prisma.jobLog.update({
          where: { id: jobLog.id },
          data: {
            status: 'completed',
            result: { productId, model: descriptionResult.generatedBy },
            completedAt: new Date(),
          },
        })

        logger.info('콘텐츠 생성 완료', { productId, model: descriptionResult.generatedBy })
        return { success: true, model: descriptionResult.generatedBy }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)

        await prisma.jobLog.update({
          where: { id: jobLog.id },
          data: { status: 'failed', error: message, completedAt: new Date() },
        })

        logger.error('콘텐츠 생성 실패', { productId, error: message })
        throw error
      }
    },
    {
      connection: redisConnection,
      // LLM 요청은 느리므로 동시성 낮게 설정
      concurrency: 2,
    }
  )

  return worker
}

/**
 * 설명 미생성 상품을 콘텐츠 큐에 추가
 * - 최초 등록 직후 또는 수동 재생성 시 호출
 */
export async function enqueueProductsForContentGeneration(
  contentQueue: Queue
): Promise<number> {
  // rawDescription이 있고 generatedDescription이 없는 상품
  const products = await prisma.product.findMany({
    where: {
      rawDescription: { not: null },
      generatedDescription: null,
      status: { not: 'deleted' },
    },
    select: { id: true },
  })

  if (products.length === 0) {
    logger.debug('콘텐츠 생성 대기 상품 없음')
    return 0
  }

  await contentQueue.addBulk(
    products.map((p) => ({
      name: 'generate-content',
      data: { productId: p.id } as ContentJobData,
    }))
  )
  logger.info(`${products.length}개 상품 콘텐츠 생성 큐에 추가`)
  return products.length
}
