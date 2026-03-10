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
  calculateProductScore,
  isCategoryAllowed,
  isCategoryAllowedForSellerType,
  getAccountStrategy,
  classifyProductType,
  isPortfolioRatioExceeded,
  getPortfolioPhase,
  assertProductUniqueKey,
  calculateExposureScore,
  EXPOSURE_SCORE_THRESHOLD,
  ocrExtract,
  translateToKorean,
  sanitizeMarketingPhrases,
  redesignImage,
  filterCompetitorPrices,
  extractSearchKeyword,
  validateTieredMargin,
  getMinMarginRate,
  isNicheProduct,
  calculateNicheScore,
  getOriginMarginAdjustment,
} from '@smartstore/core'
import { naverShoppingCrawler } from '@smartstore/crawlers'
import { fetchCompetitorCountLimited } from './competitor-limiter'
import { registerProductToNaver, uploadProductImages } from '@smartstore/integrations'
import { notificationAdapter } from '@smartstore/adapters'
import { prisma } from '@smartstore/db'
import { QUEUE_NAMES, redisConnection, blogPostingQueue, type RegistrationJobData, type BlogPostingJobData } from '../queues'
import { checkCredentialGate, gateSkipResult } from '../credential-gate'
import { getSetting } from '../settings-cache'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { buildDetailHtml, fetchDomeggookDetail } from './detail-content-builder'

const logger = createLogger('registration-job')

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
        const priceResult = calculateWholesalePrice({
          wholesalePrice: product.wholesalePrice,
          shippingFee: product.shippingFee,
          naverFeeRate: product.naverFeeRate,
          targetMarginRate: product.targetMarginRate,
        })

        logger.info('가격 계산 완료', {
          productId,
          salePrice: priceResult.salePrice,
          marginRate: `${(priceResult.marginRate * 100).toFixed(1)}%`,
        })

        // 2-0-1. 부스트 모드 판단 (리뷰 50개 미만)
        const reviewSetting = getSetting('STORE_REVIEW_COUNT')
        const storeReviewCount = reviewSetting ? parseInt(reviewSetting, 10) : 0
        const isBoostMode = storeReviewCount < 50

        // 2-0-2. 가격대별 동적 마진 검증 (tiered-margin 연결)
        const minRate = getMinMarginRate(priceResult.salePrice, { boostMode: isBoostMode })
        if (priceResult.marginRate < minRate) {
          logger.info('tiered_margin_blocked', {
            productId,
            marginRate: priceResult.marginRate,
            minRate,
            salePrice: priceResult.salePrice,
            boostMode: isBoostMode,
          })
          await prisma.jobLog.update({
            where: { id: jobLog.id },
            data: {
              status: 'completed',
              result: { skipped: true, reason: 'tiered_margin_blocked', marginRate: priceResult.marginRate, minRate },
              completedAt: new Date(),
            },
          })
          return { skipped: true, reason: 'tiered_margin_blocked' }
        }

        // 2-0-3. 니치 상품 점수 (로깅, 향후 우선순위 활용)
        const nicheScore = calculateNicheScore({
          productName: product.name,
          wholesalePrice: product.wholesalePrice,
          category: product.category,
        })
        const isNiche = isNicheProduct(product.name)
        if (isNiche) {
          logger.info('niche_product_detected', { productId, nicheScore })
        }

        // 2-1. 계정 전략 검사 (스코어 / 마진율 / 경쟁사 수)
        const strategy = getAccountStrategy(accountId)
        const scoreResult = calculateProductScore({
          marginRate: priceResult.marginRate,
          hasNaverCategory: product.naverCategoryId != null,
        })

        if (scoreResult.totalScore < strategy.minScore) {
          logger.info('상품 스코어 부족으로 등록 제외', {
            productId,
            accountId,
            score: scoreResult.totalScore,
            minScore: strategy.minScore,
          })
          await prisma.jobLog.update({
            where: { id: jobLog.id },
            data: {
              status: 'completed',
              result: { skipped: true, score: scoreResult.totalScore, reason: 'score_blocked' },
              completedAt: new Date(),
            },
          })
          return { skipped: true, reason: 'score_blocked', score: scoreResult.totalScore }
        }

        if (priceResult.marginRate < strategy.minMarginRate) {
          logger.info('margin_blocked', {
            productId,
            accountId,
            marginRate: priceResult.marginRate,
            minMarginRate: strategy.minMarginRate,
          })
          await prisma.jobLog.update({
            where: { id: jobLog.id },
            data: {
              status: 'completed',
              result: { skipped: true, reason: 'margin_blocked' },
              completedAt: new Date(),
            },
          })
          return { skipped: true, reason: 'margin_blocked' }
        }

        // 2-1-1. 가격 경쟁력 검사 (네이버 최저가 비교, 키워드 정밀화 + 이상치 필터 적용)
        const searchQuery = extractSearchKeyword(product.name)
        const lowestPrice = await Promise.race([
          naverShoppingCrawler.fetchCompetitorPrices(searchQuery, 5)
            .then((prices) => {
              if (prices.length === 0) return null
              const { filtered } = filterCompetitorPrices(prices)
              return filtered.length > 0 ? Math.min(...filtered.map((p) => p.price)) : null
            }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
        ]).catch(() => null)

        if (lowestPrice !== null && priceResult.salePrice > lowestPrice) {
          logger.info('price_not_competitive', {
            productId,
            ourPrice: priceResult.salePrice,
            naverLowest: lowestPrice,
            diff: priceResult.salePrice - lowestPrice,
          })
          await prisma.jobLog.update({
            where: { id: jobLog.id },
            data: {
              status: 'completed',
              result: {
                skipped: true,
                reason: 'price_not_competitive',
                ourPrice: priceResult.salePrice,
                naverLowest: lowestPrice,
              },
              completedAt: new Date(),
            },
          })
          return { skipped: true, reason: 'price_not_competitive', ourPrice: priceResult.salePrice, naverLowest: lowestPrice }
        }

        if (lowestPrice !== null) {
          logger.info('price_competitive_passed', {
            productId,
            ourPrice: priceResult.salePrice,
            naverLowest: lowestPrice,
          })
        } else {
          // 타임아웃/오류 → fail-open (가격 정보 없으면 등록 진행)
          logger.warn('price_check_skipped (timeout/error) — fail-open', { productId })
        }

        let competitorCount = await prisma.competitorPrice.count({
          where: { productId: product.id },
        })

        // DB에 경쟁사 데이터가 없으면 실시간 조회 시도 (동시 1개 제한, 5초 타임아웃)
        if (competitorCount === 0) {
          competitorCount = await fetchCompetitorCountLimited(product.name)
          logger.info('competitor_real_check_applied', { productId, competitorCount })
        }

        if (competitorCount > strategy.maxCompetitors) {
          logger.info('competitor_blocked', {
            productId,
            accountId,
            competitorCount,
            maxCompetitors: strategy.maxCompetitors,
          })
          await prisma.jobLog.update({
            where: { id: jobLog.id },
            data: {
              status: 'completed',
              result: { skipped: true, reason: 'competitor_blocked' },
              completedAt: new Date(),
            },
          })
          return { skipped: true, reason: 'competitor_blocked' }
        }

        // 2-2. 노출 가능성 점수 검사 (5초 타임아웃 — fail-open)
        // Promise.race: 5초 내 응답 없으면 null 반환 → 점수 체크 건너뜀 (competitor-limiter.ts와 동일 패턴)
        const top20 = await Promise.race([
          naverShoppingCrawler.fetchTop20Products(product.name),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
        ]).catch(() => null)

        if (top20 !== null) {
          const exposureScore = calculateExposureScore({
            adCount: top20.adCount,
            avgReview: top20.avgReview,
            brandCountTop10: top20.brandCountTop10,
            avgTopPrice: top20.avgTopPrice,
            myPrice: priceResult.salePrice,
          })

          if (exposureScore < EXPOSURE_SCORE_THRESHOLD) {
            logger.info('exposure_blocked', {
              productId,
              accountId,
              exposureScore,
              threshold: EXPOSURE_SCORE_THRESHOLD,
            })
            await prisma.jobLog.update({
              where: { id: jobLog.id },
              data: {
                status: 'completed',
                result: { skipped: true, reason: 'exposure_blocked', exposureScore },
                completedAt: new Date(),
              },
            })
            return { skipped: true, reason: 'exposure_blocked', exposureScore }
          }

          logger.info('exposure_score_passed', { productId, exposureScore })
        } else {
          // 타임아웃 또는 크롤링 오류 → fail-open (등록 진행)
          logger.warn('exposure_check_skipped (timeout/error) — fail-open', { productId })
        }

        // 2-3. 카테고리 가드 (계정별 허용 카테고리 검사)
        if (!isCategoryAllowed(accountId, product.category)) {
          logger.info('category_blocked', {
            productId,
            accountId,
            category: product.category,
          })
          await prisma.jobLog.update({
            where: { id: jobLog.id },
            data: {
              status: 'completed',
              result: { skipped: true, reason: 'category_blocked' },
              completedAt: new Date(),
            },
          })
          return { skipped: true, reason: 'category_blocked' }
        }

        // 2-3-2. 셀러 유형 가드 (개인 셀러 → 사업자 전용 카테고리 차단)
        const sellerType = getSetting('SELLER_TYPE') === 'business' ? 'business' : 'individual'
        if (!isCategoryAllowedForSellerType(product.category, sellerType)) {
          logger.info('business_category_blocked', {
            productId,
            category: product.category,
            sellerType,
          })
          await prisma.jobLog.update({
            where: { id: jobLog.id },
            data: {
              status: 'completed',
              result: { skipped: true, reason: 'business_category_blocked' },
              completedAt: new Date(),
            },
          })
          return { skipped: true, reason: 'business_category_blocked' }
        }

        // 2-4. 포트폴리오 비율 검사 (상품 유형별 계정 비율 제어)
        const productType = classifyProductType(priceResult.marginRate)
        const [typeCount, totalCount] = await Promise.all([
          prisma.product.count({ where: { accountId, productType, status: 'registered' } }),
          prisma.product.count({ where: { accountId, status: 'registered' } }),
        ])

        // Phase 1/2 특수 규칙 적용 시 로그 (Phase 3은 일반 비율 규칙이므로 생략)
        const portfolioPhase = getPortfolioPhase(totalCount)
        if (portfolioPhase < 3) {
          logger.info('portfolio_phase_control_applied', {
            productId,
            portfolioPhase,
            totalCount,
            productType,
          })
        }

        if (isPortfolioRatioExceeded(productType, typeCount, totalCount)) {
          logger.info('portfolio_ratio_blocked', {
            productId,
            accountId,
            productType,
            typeCount,
            totalCount,
          })
          await prisma.jobLog.update({
            where: { id: jobLog.id },
            data: {
              status: 'completed',
              result: { skipped: true, reason: 'portfolio_ratio_blocked' },
              completedAt: new Date(),
            },
          })
          return { skipped: true, reason: 'portfolio_ratio_blocked' }
        }

        // 2-5. 계정 간 상품 중복 등록 차단 (등록 직전 최종 검사)
        // uniqueKey는 크롤러가 Product 저장 시 반드시 세팅 (base-crawler.ts 참고)
        // 비어있으면 Error throw → BullMQ failed 처리 (데이터 품질 문제, skip 아님)
        assertProductUniqueKey(product.uniqueKey)

        const existing = await prisma.product.findFirst({
          where: { uniqueKey: product.uniqueKey, NOT: { id: product.id } },
        })

        if (existing) {
          logger.info('cross_account_duplicate_blocked', {
            productId,
            uniqueKey: product.uniqueKey,
            duplicateId: existing.id,
          })
          await prisma.jobLog.update({
            where: { id: jobLog.id },
            data: {
              status: 'completed',
              result: { skipped: true, reason: 'cross_account_duplicate_blocked' },
              completedAt: new Date(),
            },
          })
          return { skipped: true, reason: 'cross_account_duplicate_blocked' }
        }

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

        // 4. 네이버 상품 등록 (내부에서 1초 sleep 자동 적용)
        const registrationResult = await registerProductToNaver({
          name: product.name,
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

        // 6. 블로그 포스팅 큐 추가 (fire-and-forget, P3)
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

// =============================================
// 이미지 파이프라인 헬퍼 함수
// =============================================

/** 이미지 다운로드 (로컬 파일로 저장) */
async function downloadImage(url: string, destPath: string): Promise<boolean> {
  try {
    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: 30000,
    })
    await new Promise<void>((resolve, reject) => {
      const writer = fs.createWriteStream(destPath)
      response.data.pipe(writer)
      writer.on('finish', resolve)
      writer.on('error', reject)
    })
    return true
  } catch {
    return false
  }
}

/**
 * 상품명에서 제목 추출 (최대 22자, 특수문자 제거)
 */
function extractTitleKo(productName: string): string {
  return productName
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')  // 특수문자 → 공백
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 22)
}

/**
 * 이미지 파이프라인 실행
 * OCR → 번역 → 금칙어 필터 → 리디자인 → 네이버 업로드
 * 각 단계 실패 시 원본으로 degrade (등록 중단 금지)
 *
 * @param productId 상품 ID
 * @param originalImages 원본 이미지 URL 배열 (JSON 문자열 또는 배열)
 * @param productName 상품명 (제목 생성용)
 * @param log 로거 인스턴스
 * @returns 최종 이미지 URL 배열 (업로드 성공 시 네이버 URL, 실패 시 원본 URL)
 */
export async function runImagePipeline(
  productId: string,
  originalImages: string | string[],
  productName: string,
  log: ReturnType<typeof createLogger>
): Promise<string[]> {
  // 원본 이미지 URL 파싱
  let imageUrls: string[]
  if (typeof originalImages === 'string') {
    try {
      imageUrls = JSON.parse(originalImages) as string[]
    } catch {
      imageUrls = originalImages ? [originalImages] : []
    }
  } else {
    imageUrls = originalImages
  }

  if (imageUrls.length === 0) {
    log.warn('이미지 없음 — 파이프라인 건너뜀', { productId })
    return []
  }

  // 대표 1장 + 서브 최대 2장 (총 최대 3장)
  const targetUrls = imageUrls.slice(0, 3)

  // 로컬 임시 디렉토리 생성
  const outputDir = process.env['IMAGE_OUTPUT_DIR'] ?? './data/generated'
  const rawDir = path.join(outputDir, productId)
  try {
    fs.mkdirSync(rawDir, { recursive: true })
  } catch {
    log.warn('이미지 디렉토리 생성 실패 — 원본 URL 사용', { productId, rawDir })
    return imageUrls
  }

  const finalPaths: string[] = []

  for (let i = 0; i < targetUrls.length; i++) {
    const url = targetUrls[i]!
    const rawPath = path.join(rawDir, `raw_${i}.jpg`)
    const cleanedPath = path.join(rawDir, `cleaned_${i}.jpg`)

    // A) 이미지 다운로드
    const downloaded = await downloadImage(url, rawPath)
    if (!downloaded) {
      log.warn('이미지 다운로드 실패 — 원본 URL 사용', { productId, url })
      finalPaths.push(rawPath) // 이후 단계에서 원본 URL로 fallback
      continue
    }

    // B-1) OCR 추출
    let texts: string[] = []
    try {
      texts = await ocrExtract(rawPath)
    } catch {
      log.warn('ocr_failed', { productId, rawPath })
      // degrade: OCR 없이 계속
    }

    // B-2) 번역
    let translated: string[] = texts
    if (texts.length > 0) {
      try {
        translated = await translateToKorean(texts)
      } catch {
        log.warn('translate_failed', { productId })
        translated = texts // 원문 유지
      }
    }

    // B-3) 금칙어 필터 → 불릿 추출
    const bulletsKo = sanitizeMarketingPhrases(translated)

    // B-4) 제목 추출
    const titleKo = extractTitleKo(productName)

    // B-5) 이미지 리디자인
    const redesigned = await redesignImage({
      inputPath: rawPath,
      outputPath: cleanedPath,
      titleKo,
      bulletsKo,
    })

    if (redesigned) {
      finalPaths.push(cleanedPath)
    } else {
      log.warn('redesign_failed — raw 이미지 사용', { productId, rawPath })
      finalPaths.push(rawPath)
    }
  }

  // C) 네이버 이미지 업로드
  let uploadedUrls: string[] = []
  try {
    uploadedUrls = await uploadProductImages(finalPaths)
  } catch {
    log.warn('naver_upload_failed — 원본 URL 사용', { productId })
  }

  // 업로드 성공 시 네이버 URL, 실패 시 원본 URL (degrade)
  if (uploadedUrls.length > 0) {
    log.info('이미지 파이프라인 완료 (네이버 URL)', {
      productId,
      count: uploadedUrls.length,
    })
    return uploadedUrls
  }

  log.warn('이미지 업로드 전체 실패 — 원본 URL 사용', { productId })
  return imageUrls
}

