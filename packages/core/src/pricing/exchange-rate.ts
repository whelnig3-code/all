// =============================================
// 환율 서비스 — 외부 API에서 환율 조회 + 메모리 캐시
//
// 비유: 환전소 창구와 같다.
// 손님이 환율을 물으면 먼저 오늘 게시판(캐시)을 확인하고,
// 게시판이 오래됐으면 본사(API)에 전화해서 새 환율을 받아온다.
// 본사가 안 받으면 어제 환율(fallback)을 알려준다.
// =============================================

import { createLogger } from '@smartstore/shared'

const logger = createLogger('exchange-rate')

// =============================================
// 타입 정의
// =============================================

export interface ExchangeRateResult {
  currency: 'USD' | 'CNY'
  rate: number
  fetchedAt: Date
  source: string
}

export type FetchRateFn = (currency: 'USD' | 'CNY') => Promise<ExchangeRateResult>

export interface ExchangeRateServiceOptions {
  /** API에서 환율을 조회하는 함수 (DI) */
  fetchRate: FetchRateFn
  /** 캐시 TTL (ms). 기본 1시간 */
  ttlMs?: number
}

export interface ExchangeRateService {
  getRate(currency: 'USD' | 'CNY'): Promise<ExchangeRateResult>
  invalidateCache(): void
}

// =============================================
// 상수
// =============================================

const DEFAULT_TTL_MS = 3_600_000 // 1시간

const FALLBACK_RATES: Record<'USD' | 'CNY', number> = {
  USD: 1300,
  CNY: 180,
}

// =============================================
// 캐시 엔트리 타입
// =============================================

interface CacheEntry {
  readonly result: ExchangeRateResult
  readonly cachedAt: number
}

// =============================================
// 팩토리 함수
// =============================================

export function createExchangeRateService(
  options: ExchangeRateServiceOptions
): ExchangeRateService {
  const { fetchRate, ttlMs = DEFAULT_TTL_MS } = options

  /** 통화별 캐시 저장소 */
  let cache: Record<string, CacheEntry> = {}

  /** 동시 요청 방지용 진행 중 Promise 저장소 */
  let pending: Record<string, Promise<ExchangeRateResult>> = {}

  function isCacheValid(currency: string): boolean {
    const entry = cache[currency]
    if (!entry) return false
    return Date.now() - entry.cachedAt < ttlMs
  }

  function copyResult(result: ExchangeRateResult): ExchangeRateResult {
    return {
      currency: result.currency,
      rate: result.rate,
      fetchedAt: new Date(result.fetchedAt.getTime()),
      source: result.source,
    }
  }

  function createFallback(currency: 'USD' | 'CNY'): ExchangeRateResult {
    return {
      currency,
      rate: FALLBACK_RATES[currency],
      fetchedAt: new Date(),
      source: 'fallback',
    }
  }

  async function fetchAndCache(currency: 'USD' | 'CNY'): Promise<ExchangeRateResult> {
    try {
      const result = await fetchRate(currency)

      cache = {
        ...cache,
        [currency]: {
          result: { ...result },
          cachedAt: Date.now(),
        },
      }

      return result
    } catch (error) {
      logger.warn(
        `환율 API 실패 (${currency}), fallback 사용`,
        error instanceof Error ? error.message : error
      )
      return createFallback(currency)
    } finally {
      // 진행 중 Promise 정리 — 새 객체로 교체 (불변성)
      const { [currency]: _removed, ...rest } = pending
      pending = rest
    }
  }

  return {
    async getRate(currency) {
      // 1. 캐시 유효하면 복사본 반환
      if (isCacheValid(currency)) {
        return copyResult(cache[currency].result)
      }

      // 2. 이미 진행 중인 요청이 있으면 대기
      if (pending[currency] != null) {
        const result = await pending[currency]
        return copyResult(result)
      }

      // 3. 새 요청 시작 (lock 패턴)
      const promise = fetchAndCache(currency)
      pending = { ...pending, [currency]: promise }

      const result = await promise
      return copyResult(result)
    },

    invalidateCache() {
      cache = {}
    },
  }
}
