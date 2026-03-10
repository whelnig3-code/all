// =============================================
// 블로그 포스팅 워커 (P3)
//
// 역할:
//   - LLM으로 상품 기반 블로그 포스트 생성
//   - 네이버 블로그 API로 게시
//   - 실패해도 상품 등록 흐름에 영향 없음 (fire-and-forget)
//   - BLOG_POSTING_ENABLED=false 시 dry-run 모드
//   - 중복 포스팅 방지 (blogPostUrl 존재 시 스킵)
//   - 일일 포스팅 한도 (BLOG_DAILY_LIMIT, 기본 20)
// =============================================

import { Worker, Job } from 'bullmq'
import { createLogger } from '@smartstore/shared'
import { generateBlogPost } from '@smartstore/core'
import { postToNaverBlog } from '@smartstore/integrations'
import { notificationAdapter } from '@smartstore/adapters'
import { prisma } from '@smartstore/db'
import { QUEUE_NAMES, redisConnection, type BlogPostingJobData } from '../queues'
import { checkCredentialGate, gateSkipResult } from '../credential-gate'
import { getSetting } from '../settings-cache'

const logger = createLogger('blog-posting-job')

/**
 * 블로그 포스팅 워커
 * - 중복 방지: blogPostUrl이 이미 있으면 스킵
 * - 일일 한도: BLOG_DAILY_LIMIT (기본 20) 초과 시 스킵
 * - LLM 생성 실패 시 템플릿 fallback 자동 적용 (generateBlogPost 내부)
 * - 네이버 API 실패 시 로그 남기고 정상 종료
 * - 성공 시 blogPostUrl + blogPostedAt DB 업데이트
 */
export function createBlogPostingWorker(): Worker {
  const worker = new Worker<BlogPostingJobData>(
    QUEUE_NAMES.BLOG_POSTING,
    async (job: Job<BlogPostingJobData>) => {
      const { productId, productName, category, salePrice, description } = job.data

      // 자격증명 게이트: 네이버 블로그 필수
      const gate = await checkCredentialGate(['naver_blog'])
      if (!gate.passed) return gateSkipResult(gate.missing)

      // 중복 포스팅 방지: blogPostUrl이 이미 있으면 스킵
      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { blogPostUrl: true },
      })

      if (product?.blogPostUrl) {
        logger.info('이미 블로그 포스팅됨, 스킵', { productId })
        return { action: 'skipped', reason: 'already_posted' }
      }

      // 일일 포스팅 한도 체크
      const dailyLimit = parseInt(getSetting('BLOG_DAILY_LIMIT') ?? '20', 10)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayCount = await prisma.product.count({
        where: { blogPostedAt: { gte: today } },
      })

      if (todayCount >= dailyLimit) {
        logger.info('일일 포스팅 한도 도달', { todayCount, dailyLimit })
        return { action: 'skipped', reason: 'daily_limit' }
      }

      logger.info(`블로그 포스팅 시작: ${productName}`, { jobId: job.id, productId })

      try {
        // 1. 블로그 포스트 생성 (LLM 실패 시 template fallback 자동 적용)
        const blogPost = await generateBlogPost({
          productName,
          category,
          salePrice,
          description,
        })

        logger.info('블로그 포스트 생성 완료', {
          productId,
          titleLength: blogPost.title.length,
          tagsCount: blogPost.tags.length,
        })

        // 2. 네이버 블로그 게시
        const result = await postToNaverBlog({
          title: blogPost.title,
          contents: blogPost.body,
          tags: blogPost.tags.join(','),
          isOpenPost: true,
        })

        if (!result.success) {
          // 게시 실패 — 상품 등록에는 영향 없음, 로그만 남김
          logger.warn('블로그 게시 실패 (등록 흐름 무영향)', {
            productId,
            error: result.error,
          })
          return { action: 'failed', error: result.error }
        }

        // 3. 성공 시 DB 업데이트 + 알림
        if (result.postUrl) {
          await prisma.product.update({
            where: { id: productId },
            data: {
              blogPostUrl: result.postUrl,
              blogPostedAt: new Date(),
            },
          })

          void notificationAdapter.send({
            type: 'blog_posted',
            title: '블로그 포스팅 완료',
            message: `"${productName}" 블로그 게시 완료\n${result.postUrl}`,
            data: { productId, postUrl: result.postUrl },
          })
        }

        logger.info('블로그 포스팅 완료', {
          productId,
          productName,
          postUrl: result.postUrl,
        })

        return { action: 'posted', postUrl: result.postUrl }
      } catch (error) {
        // 예상치 못한 오류 — 상품 등록에 영향 없도록 throw 하지 않음
        const message = error instanceof Error ? error.message : String(error)
        logger.error('블로그 포스팅 워커 오류 (등록 흐름 무영향)', {
          productId,
          error: message,
        })
        return { action: 'error', error: message }
      }
    },
    {
      connection: redisConnection,
      concurrency: 1, // LLM 호출 부하 제한
    }
  )

  return worker
}
