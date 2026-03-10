// =============================================
// 상품 자동 등록 작업
// - DB에서 pending 상품 조회
// - 가격 계산 (안전장치 포함)
// - 네이버 스마트스토어 자동 등록
// - Rate limit: 초당 1건 (CLAUDE.md 필수 규칙)
// =============================================

import { Worker, Job } from 'bullmq'
import { createLogger } from '@smartstore/shared'
import {
  calculateWholesalePrice,
  isNicheProduct,
  calculateNicheScore,
  getOriginMarginAdjustment,
  classifyNicheCategory,
  optimizeProductTitle,
  generateSearchTags,
  shouldRetry,
  calculateRetryPrice,
  getMaxRetryCount,
  type RejectionReason,
  shouldShowDiscount,
  calculateDiscountDisplay,
  buildBlogPostWithSections,
} from '@smartstore/core'
import { registerProductToNaver } from '@smartstore/integrations'
import { notificationAdapter } from '@smartstore/adapters'
import { prisma } from '@smartstore/db'
import { QUEUE_NAMES, redisConnection, registrationQueue, blogPostingQueue, type RegistrationJobData, type BlogPostingJobData } from '../queues'
import { checkCredentialGate, gateSkipResult } from '../credential-gate'
import { getSetting } from '../settings-cache'
import { buildDetailHtml, fetchDomeggookDetail } from './detail-content-builder'
import { runImagePipeline } from './registration-image-pipeline'
import {
  checkTieredMargin,
  checkAccountStrategy,
  checkPriceCompetitiveness,
  checkCompetitorCount,
  checkExposureScore,
  checkCategoryGuards,
  checkPortfolioRatio,
  checkDuplicateProduct,
} from './registration-guards'

const logger = createLogger('registration-job')

/**
 * 거부된 상품을 가격 조정 후 재등록 큐에 추가 (스마트 재시도)
 * - 재시도 가능 사유만 처리 (exposure_blocked, price_not_competitive)
 * - 최대 재시도 횟수 초과 시 무시
 * - 30초 딜레이 후 큐에 추가 (즉시 재시도 방지)
 */
async function enqueueRetryIfEligible(
  productId: string,
  reason: string,
  currentPrice: number,
  competitorPrice?: number,
  currentRetryCount = 0,
): Promise<boolean> {
  const rejectionReason = reason as RejectionReason
  if (!shouldRetry(rejectionReason)) return false

  const maxRetries = getMaxRetryCount(rejectionReason)
  const nextAttempt = currentRetryCount + 1
  if (nextAttempt > maxRetries) {
    logger.info('retry_max_exceeded', { productId, reason, attempts: currentRetryCount })
    return false
  }

  const retryResult = calculateRetryPrice({
    reason: rejectionReason,
    currentPrice,
    competitorPrice,
    attemptNumber: nextAttempt,
  })

  if (!retryResult) return false

  await registrationQueue.add(
    'register-product-retry',
    {
      productId,
      retryCount: nextAttempt,
      retryReason: reason,
      retryPrice: retryResult.adjustedPrice,
    } satisfies RegistrationJobData,
    { delay: 30_000 }, // 30초 후 재시도
  )

  logger.info('retry_enqueued', {
    productId,
    reason,
    attempt: nextAttempt,
    adjustedPrice: retryResult.adjustedPrice,
    discountRate: `${(retryResult.discountRate * 100).toFixed(1)}%`,
  })

  return true
}

/**
 * 상품 등록 워커
 * - 큐에서 RegistrationJobData를 소비
 * - DB 상품 조회 → 가격 계산 → 네이버 등록 → DB 업데이트
 */
export function createRegistrationWorker(): Worker {
  const worker = new Worker<RegistrationJobData>(
    QUEUE_NAMES.PRODUCT_REGISTRATION,
    async (job: Job<RegistrationJobData>) => {
      const { productId } = job.data

      // 자격증명 게이트: 네이버 커머스 필수
      const gate = await checkCredentialGate(['naver_commerce'])
      if (!gate.passed) return gateSkipResult(gate.missing)

      logger.info(`상품 등록 작업 시작: ${productId}`, { jobId: job.id })

      // 작업 로그 기록 (시작)
      const jobLog = await prisma.jobLog.create({
        data: {
          jobType: 'registration',
          jobId: job.id ?? '',
          status: 'started',
          payload: { productId },
          startedAt: new Date(),
        },
      })

      try {
        // 0. 계정 ID 결정 (이하 모든 가드에서 공통 사용)
        const accountId = process.env['ACCOUNT_ID'] ?? 'default'

        // 1. DB에서 상품 정보 조회
        const product = await prisma.product.findUnique({
          where: { id: productId },
        })

        if (!product) {
          throw new Error(`상품을 찾을 수 없음: ${productId}`)
        }

        if (product.status !== 'pending') {
          logger.warn(`상품이 pending 상태가 아님: ${product.status}`, { productId })
          return { skipped: true, reason: `상태: ${product.status}` }
        }

        if (!product.wholesalePrice || !product.shippingFee) {
          throw new Error(`도매가 또는 배송비 누락: ${productId}`)
        }

        // 2. 가격 계산 (안전장치 자동 적용)
        const rawPriceResult = calculateWholesalePrice({
          wholesalePrice: product.wholesalePrice,
          shippingFee: product.shippingFee,
          naverFeeRate: product.naverFeeRate,
          targetMarginRate: product.targetMarginRate,
        })

        // 재시도 가격이 있으면 오버라이드 (마진 최저선 이상일 때만)
        const priceResult = job.data.retryPrice && job.data.retryPrice < rawPriceResult.salePrice
          ? {
              ...rawPriceResult,
              salePrice: job.data.retryPrice,
              marginRate: (job.data.retryPrice - rawPriceResult.cost) / job.data.retryPrice,
            }
          : rawPriceResult

        if (job.data.retryCount && job.data.retryCount > 0) {
          logger.info('retry_price_applied', {
            productId,
            attempt: job.data.retryCount,
            originalPrice: rawPriceResult.salePrice,
            retryPrice: priceResult.salePrice,
            reason: job.data.retryReason,
          })
        }

        logger.info('가격 계산 완료', {
          productId,
          salePrice: priceResult.salePrice,
          marginRate: `${(priceResult.marginRate * 100).toFixed(1)}%`,
        })

        // 2-0-1. 부스트 모드 판단 (리뷰 50개 미만)
        const reviewSetting = getSetting('STORE_REVIEW_COUNT')
        const storeReviewCount = reviewSetting ? parseInt(reviewSetting, 10) : 0
        const isBoostMode = storeReviewCount < 50

        // 2-0-2. 가격대별 동적 마진 검증
        const tieredResult = await checkTieredMargin(jobLog.id, productId, priceResult.salePrice, priceResult.marginRate, isBoostMode)
        if (tieredResult) return tieredResult

        // 2-0-3. 니치 상품 점수 (로깅)
        const nicheScore = calculateNicheScore({ productName: product.name, wholesalePrice: product.wholesalePrice, category: product.category })
        if (isNicheProduct(product.name)) {
          logger.info('niche_product_detected', { productId, nicheScore })
        }

        // 2-1. 계정 전략 검사 (스코어 / 마진율)
        const strategyResult = await checkAccountStrategy(jobLog.id, productId, accountId, priceResult.marginRate, product.naverCategoryId != null)
        if (strategyResult) return strategyResult

        // 2-1-1. 가격 경쟁력 검사
        const priceCheck = await checkPriceCompetitiveness(jobLog.id, productId, product.name, priceResult.salePrice)
        if (priceCheck.skip) {
          await enqueueRetryIfEligible(productId, 'price_not_competitive', priceResult.salePrice, priceCheck.lowestPrice ?? undefined, job.data.retryCount ?? 0)
          return priceCheck.skip
        }

        // 2-1-2. 경쟁사 수 검사
        const competitorResult = await checkCompetitorCount(jobLog.id, product.id, accountId, product.name)
        if (competitorResult) return competitorResult

        // 2-2. 노출 가능성 점수 검사
        const exposureResult = await checkExposureScore(jobLog.id, productId, accountId, product.name, priceResult.salePrice)
        if (exposureResult) {
          await enqueueRetryIfEligible(productId, 'exposure_blocked', priceResult.salePrice, undefined, job.data.retryCount ?? 0)
          return exposureResult
        }

        // 2-3. 카테고리 가드
        const categoryResult = await checkCategoryGuards(jobLog.id, productId, accountId, product.name, product.category)
        if (categoryResult) return categoryResult

        // 2-4. 포트폴리오 비율 검사
        const portfolioResult = await checkPortfolioRatio(jobLog.id, productId, accountId, priceResult.marginRate)
        if (portfolioResult.skip) return portfolioResult.skip
        const productType = portfolioResult.productType

        // 2-5. 계정 간 상품 중복 등록 차단
        const duplicateResult = await checkDuplicateProduct(jobLog.id, productId, product.uniqueKey)
        if (duplicateResult) return duplicateResult

        // 3. 이미지 파이프라인 (OCR → 번역 → 필터 → 리디자인 → 업로드)
        //    실패 시 등록 중단 금지 — 원본 이미지로 degrade
        const finalImages = await runImagePipeline(product.id, product.images, product.name, logger)

        // 3-1. 도매꾹 상세 데이터 조회 (풍부한 상세설명용 + 원산지, fail-open)
        const domeggookData = product.source === 'domaegguk'
          ? await fetchDomeggookDetail(product.sourceProductId)
          : null

        // 3-2. 원산지 추출 (도매꾹 API detail.country)
        const rawCountry = (domeggookData?.detail as Record<string, unknown> | undefined)?.country
        const origin = rawCountry && String(rawCountry) !== '해당없음' && String(rawCountry) !== '.'
          ? String(rawCountry).replace(/_/g, ' ').trim()
          : null

        // 3-3. 원산지 기반 마진 보정 (한국산 +5%, 일본/독일/미국 +3%, 중국 -3%)
        const originAdjustment = getOriginMarginAdjustment(origin)
        if (originAdjustment !== 0) {
          logger.info('origin_margin_adjustment', {
            productId,
            origin,
            adjustment: `${originAdjustment > 0 ? '+' : ''}${(originAdjustment * 100).toFixed(0)}%`,
          })
        }

        // 3-4. SEO 최적화 (상품명 정리 + 검색 태그 생성)
        const optimizedName = optimizeProductTitle({
          originalName: product.name,
          category: product.category,
        })
        const searchTags = generateSearchTags(product.name)

        if (optimizedName !== product.name) {
          logger.info('seo_title_optimized', {
            productId,
            original: product.name,
            optimized: optimizedName,
            tagCount: searchTags.length,
          })
        }

        // 3-5. 할인 표시 계산 (재시도 상품만)
        const retryCount = job.data.retryCount ?? 0
        const showDiscount = shouldShowDiscount({
          retryCount,
          originalPrice: rawPriceResult.salePrice,
          adjustedPrice: priceResult.salePrice,
        })
        const discountInfo = showDiscount
          ? (() => {
              const dd = calculateDiscountDisplay({
                originalPrice: rawPriceResult.salePrice,
                adjustedPrice: priceResult.salePrice,
              })
              logger.info('discount_display_applied', {
                productId,
                originalPrice: dd.originalPrice,
                salePrice: dd.salePrice,
                discountRate: `${dd.discountRate}%`,
              })
              return { originalPrice: dd.originalPrice, discountRate: dd.discountRate }
            })()
          : undefined

        // 4. 네이버 상품 등록 (내부에서 1초 sleep 자동 적용)
        const registrationResult = await registerProductToNaver({
          name: optimizedName || product.name,
          salePrice: priceResult.salePrice,
          category: {
            id: product.naverCategoryId ?? '',
            name: product.category,
          },
          images: finalImages,
          description: buildDetailHtml(
            finalImages,
            product.description ?? '',
            product.name,
            priceResult.salePrice,
            domeggookData,
            { boostMode: isBoostMode, category: product.category },
          ),
          stockQuantity: product.stockQuantity,
          deliveryInfo: {
            deliveryFee: product.shippingFee,
            deliveryType: product.shippingFee === 0 ? 'FREE' : 'PAID',
          },
          discountInfo,
        })

        if (!registrationResult.success) {
          throw new Error(`네이버 등록 실패: ${registrationResult.error}`)
        }

        // 4. DB 상태 업데이트 (productType 함께 저장)
        await prisma.$transaction([
          prisma.product.update({
            where: { id: productId },
            data: {
              status: 'registered',
              naverProductId: String(registrationResult.originProductNo),
              salePrice: priceResult.salePrice,
              productType,
              nicheCategory: classifyNicheCategory(product.name),
              optimizedName: optimizedName !== product.name ? optimizedName : undefined,
              searchTags,
              registeredAt: new Date(),
              ...(origin ? { origin } : {}),
            },
          }),
          prisma.jobLog.update({
            where: { id: jobLog.id },
            data: {
              status: 'completed',
              result: {
                salePrice: priceResult.salePrice,
                originProductNo: registrationResult.originProductNo,
              },
              completedAt: new Date(),
            },
          }),
        ])

        // 5. 성공 알림 전송 (비동기, 실패해도 작업은 성공)
        notificationAdapter
          .send({
            type: 'product_registered',
            title: '상품 등록 완료',
            message: `"${product.name}" 네이버 스마트스토어 등록 완료\n판매가: ${priceResult.salePrice.toLocaleString()}원`,
            data: { productId, originProductNo: registrationResult.originProductNo },
          })
          .catch((err) => logger.error('알림 전송 실패', err))

        // 6. 블로그 글 자동 생성 + DB 저장 (대시보드 복사용, 템플릿 전용)
        //    LLM 블로그 글은 step 7의 blogPostingQueue에서 별도 생성 (BLOG_POSTING_ENABLED=true 시)
        try {
          const blogPost = buildBlogPostWithSections({
            productName: product.name,
            category: product.category,
            salePrice: priceResult.salePrice,
            description: product.generatedDescription ?? product.description ?? undefined,
          })

          await prisma.product.update({
            where: { id: productId },
            data: {
              blogTitle: blogPost.title,
              blogContent: blogPost.body,
              blogTags: blogPost.tags,
              blogGeneratedAt: new Date(),
            },
          })
          logger.info('블로그 글 생성 완료', { productId, title: blogPost.title })
        } catch (err) {
          logger.warn('블로그 글 생성 실패 (무영향)', err)
        }

        // 7. 블로그 포스팅 큐 추가 (fire-and-forget, P3)
        //    BLOG_POSTING_ENABLED=true 시에만 추가, 실패해도 등록 결과에 영향 없음
        const blogEnabled = getSetting('BLOG_POSTING_ENABLED')
        if (blogEnabled === 'true') {
          blogPostingQueue
            .add('post-blog', {
              productId,
              productName: product.name,
              category: product.category,
              salePrice: priceResult.salePrice,
              description: product.generatedDescription ?? product.description ?? undefined,
            } satisfies BlogPostingJobData)
            .catch((err) => logger.warn('블로그 포스팅 큐 추가 실패 (무영향)', err))

          logger.info('블로그 포스팅 큐 추가', { productId })
        }

        logger.info('상품 등록 완료', {
          productId,
          originProductNo: registrationResult.originProductNo,
        })
        return registrationResult
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)

        await prisma.jobLog.update({
          where: { id: jobLog.id },
          data: {
            status: 'failed',
            error: message,
            completedAt: new Date(),
          },
        })

        logger.error('상품 등록 실패', { productId, error: message })
        throw error // BullMQ가 재시도 처리
      }
    },
    {
      connection: redisConnection,
      concurrency: 1, // 순차 처리 (Rate limit 준수)
    }
  )

  worker.on('completed', (job) => {
    logger.info(`작업 완료: ${job.id}`)
  })

  worker.on('failed', (job, err) => {
    logger.error(`작업 실패: ${job?.id}`, err)
  })

  return worker
}

/**
 * 모든 pending 상품을 등록 큐에 추가
 */
export async function enqueuePendingProducts(
  registrationQueue: import('bullmq').Queue
): Promise<number> {
  const pendingProducts = await prisma.product.findMany({
    where: { status: 'pending' },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })

  if (pendingProducts.length === 0) {
    logger.info('등록 대기 상품 없음')
    return 0
  }

  const jobs = pendingProducts.map((p) => ({
    name: 'register-product',
    data: { productId: p.id } as RegistrationJobData,
  }))

  await registrationQueue.addBulk(jobs)
  logger.info(`${pendingProducts.length}개 상품 등록 큐에 추가됨`)

  return pendingProducts.length
}


