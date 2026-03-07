// =============================================
// 경쟁사 실조회 Promise Queue Mutex
//
// Playwright 크롤러를 동시 1개로 제한하여 과부하 방지.
// Promise 체인 기반 순차 실행 보장 + 큐 심도 상한으로 무한 누적 방지.
//   queue = queue.then(() => executeWithTimeout(fn))
// =============================================

import { naverShoppingCrawler } from '@smartstore/crawlers'
import { createLogger } from '@smartstore/shared'

const logger = createLogger('competitor-limiter')

/**
 * 큐 심도 상한 — 이 값을 초과하는 요청은 즉시 fallback 50 반환
 * workerConcurrency=1 베타 환경에서는 사실상 도달 불가
 */
export const MAX_QUEUE_DEPTH = 10

/**
 * 순차 실행을 보장하는 Promise 큐
 * 동시에 여러 호출이 들어와도 큐에 순서대로 적재되어 항상 1개씩 실행된다.
 */
let queue: Promise<void> = Promise.resolve()

/** 현재 큐에 대기/실행 중인 요청 수 */
let queueDepth = 0

/** @internal 테스트 전용 — 큐 및 심도 초기화 */
export function _resetQueueForTest(): void {
  queue = Promise.resolve()
  queueDepth = 0
}

/** 현재 큐 심도 (모니터링/테스트용) */
export function getQueueDepth(): number {
  return queueDepth
}

/**
 * 네이버쇼핑 경쟁사 수 실조회 (Promise Queue — 동시 1개 보장)
 *
 * - 이전 조회가 완료된 후 다음 조회 시작 (순차 실행)
 * - 큐 심도 MAX_QUEUE_DEPTH 초과 시 즉시 fallback 50 반환
 * - 5초 타임아웃 또는 오류 시 보수적 기본값 50 반환
 *
 * @param productName 조회할 상품명
 * @returns 경쟁사 수 (큐 초과/오류/타임아웃 시 50)
 */
export async function fetchCompetitorCountLimited(productName: string): Promise<number> {
  // 큐 심도 상한 초과 시 즉시 fallback — 무한 누적 방지
  if (queueDepth >= MAX_QUEUE_DEPTH) {
    logger.warn('competitor_check_queue_full', { productName, queueDepth })
    return 50
  }

  queueDepth++
  const current = queue.then(() => executeWithTimeout(productName))

  // 다음 호출이 현재 조회 완료 후 실행되도록 큐 갱신
  queue = current.then(() => undefined)

  try {
    return await current
  } finally {
    // 성공/실패/타임아웃 모두 심도 복구 보장
    queueDepth--
  }
}

/**
 * 5초 타임아웃 적용 실조회
 * 오류/타임아웃 시 항상 50을 반환 (reject 없음 — 큐 체인 유지)
 */
async function executeWithTimeout(productName: string): Promise<number> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), 5000)
  )
  try {
    const prices = await Promise.race([
      naverShoppingCrawler.fetchCompetitorPrices(productName, 10),
      timeoutPromise,
    ])
    return prices.length
  } catch {
    logger.warn('competitor_check_failed_fallback', { productName, fallbackCount: 50 })
    return 50
  }
}
