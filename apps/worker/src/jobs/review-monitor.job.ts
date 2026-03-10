// =============================================
// 리뷰 모니터링 작업 (Phase C)
//
// 비유: 식당 리뷰 관리자. 리뷰가 적으면 할인(부스트)으로
// 리뷰를 빠르게 모으고, 충분히 쌓이면 정상 가격으로 복귀.
//
// 부스트 모드: 리뷰 < 50개 → 마진 할인 허용 (리뷰 확보 우선)
// 리뷰 ≥ 50개 → 부스트 해제, 정상 마진 복귀
// =============================================

import { Worker, Job } from 'bullmq'
import { createLogger } from '@smartstore/shared'
import { notificationAdapter } from '@smartstore/adapters'
import { prisma } from '@smartstore/db'
import { QUEUE_NAMES, redisConnection, type ReviewMonitorJobData } from '../queues'
import { checkCredentialGate, gateSkipResult } from '../credential-gate'

const logger = createLogger('review-monitor-job')

/** 부스트 모드 활성화 기준 리뷰 수 */
const BOOST_THRESHOLD = 50

/**
 * 부스트 모드 활성화 판단
 * 리뷰 < 50개이고 아직 부스트 안 됨 → 활성화
 */
export function shouldActivateBoost(reviewCount: number, currentlyActive: boolean): boolean {
  return reviewCount < BOOST_THRESHOLD && !currentlyActive
}

/**
 * 부스트 모드 해제 판단
 * 리뷰 ≥ 50개이고 현재 부스트 활성 → 해제
 */
export function shouldDeactivateBoost(reviewCount: number, currentlyActive: boolean): boolean {
  return reviewCount >= BOOST_THRESHOLD && currentlyActive
}

/**
 * 리뷰 모니터링 워커 생성
 */
export function createReviewMonitorWorker(): Worker {
  const worker = new Worker<ReviewMonitorJobData>(
    QUEUE_NAMES.REVIEW_MONITOR,
    async (job: Job<ReviewMonitorJobData>) => {
      const gate = await checkCredentialGate(['naver_commerce'])
      if (!gate.passed) return gateSkipResult(gate.missing)

      const { productId, naverProductId, accountId } = job.data
      logger.info(`리뷰 모니터링: ${productId}`, { jobId: job.id })

      const jobLog = await prisma.jobLog.create({
        data: {
          jobType: 'review_monitor',
          jobId: job.id ?? '',
          status: 'started',
          payload: { productId, naverProductId },
          startedAt: new Date(),
        },
      })

      try {
        const product = await prisma.product.findUnique({
          where: { id: productId },
          select: { reviewCount: true, boostModeActivated: true, name: true },
        })

        if (!product) {
          await prisma.jobLog.update({
            where: { id: jobLog.id },
            data: { status: 'completed', result: { skipped: true, reason: 'product_not_found' }, completedAt: new Date() },
          })
          return { skipped: true, reason: 'product_not_found' }
        }

        // TODO: 네이버 API에서 실제 리뷰 수 크롤링 (현재는 DB 값 기반)
        const reviewCount = product.reviewCount

        // 부스트 모드 전환 판단
        if (shouldActivateBoost(reviewCount, product.boostModeActivated)) {
          await prisma.product.update({
            where: { id: productId },
            data: { boostModeActivated: true },
          })

          try {
            await notificationAdapter.send(
              `🚀 부스트 모드 활성화: ${product.name}\n리뷰 ${reviewCount}개 (목표: ${BOOST_THRESHOLD}개)`,
            )
          } catch { /* 알림 실패 무시 */ }

          logger.info(`부스트 모드 활성화: ${productId}`, { reviewCount })
        } else if (shouldDeactivateBoost(reviewCount, product.boostModeActivated)) {
          await prisma.product.update({
            where: { id: productId },
            data: { boostModeActivated: false },
          })

          try {
            await notificationAdapter.send(
              `✅ 부스트 모드 해제: ${product.name}\n리뷰 ${reviewCount}개 달성!`,
            )
          } catch { /* 알림 실패 무시 */ }

          logger.info(`부스트 모드 해제: ${productId}`, { reviewCount })
        }

        await prisma.jobLog.update({
          where: { id: jobLog.id },
          data: {
            status: 'completed',
            result: { reviewCount, boostModeActivated: product.boostModeActivated },
            completedAt: new Date(),
          },
        })

        return { success: true, reviewCount }
      } catch (error) {
        await prisma.jobLog.update({
          where: { id: jobLog.id },
          data: { status: 'failed', error: String(error), completedAt: new Date() },
        })
        throw error
      }
    },
    { connection: redisConnection, concurrency: 3 },
  )

  return worker
}

/**
 * 활성 상품들을 리뷰 모니터링 큐에 추가
 */
export async function enqueueReviewMonitorProducts(
  queue: { add: (name: string, data: ReviewMonitorJobData) => Promise<unknown> },
): Promise<number> {
  const products = await prisma.product.findMany({
    where: { status: 'active', naverProductId: { not: null } },
    select: { id: true, naverProductId: true, accountId: true },
  })

  for (const p of products) {
    await queue.add('review-monitor', {
      productId: p.id,
      naverProductId: p.naverProductId!,
      accountId: p.accountId,
    })
  }

  return products.length
}
