// =============================================
// 블로그 포스팅 워커 (P3)
//
// 역할:
//   - LLM으로 상품 기반 블로그 포스트 생성
//   - 네이버 블로그 API로 게시
//   - 실패해도 상품 등록 흐름에 영향 없음 (fire-and-forget)
//   - BLOG_POSTING_ENABLED=false 시 dry-run 모드
// =============================================

import { Worker, Job } from 'bullmq'
import { createLogger } from '@smartstore/shared'
import { generateBlogPost } from '@smartstore/core'
import { postToNaverBlog } from '@smartstore/integrations'
import { notificationAdapter } from '@smartstore/adapters'
import { QUEUE_NAMES, redisConnection, type BlogPostingJobData } from '../queues'
import { checkCredentialGate, gateSkipResult } from '../credential-gate'

const logger = createLogger('blog-posting-job')

/**
 * 블로그 포스팅 워커
 * - LLM 생성 실패 시 템플릿 fallback 자동 적용 (generateBlogPost 내부)
 * - 네이버 API 실패 시 로그 남기고 정상 종료
 */
export function createBlogPostingWorker(): Worker {
  const worker = new Worker<BlogPostingJobData>(
    QUEUE_NAMES.BLOG_POSTING,
    async (job: Job<BlogPostingJobData>) => {
      const { productId, productName, category, salePrice, description } = job.data

      // 자격증명 게이트: 네이버 블로그 필수
      const gate = await checkCredentialGate(['naver_blog'])
      if (!gate.passed) return gateSkipResult(gate.missing)

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

        // 3. 성공 알림 (선택적)
        if (result.postUrl) {
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
