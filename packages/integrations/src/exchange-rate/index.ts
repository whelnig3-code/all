// =============================================
// 환율 API 클라이언트 (Phase 5 구매대행 준비)
//
// 역할:
//   - ExchangeRate-API v6 기반 실시간 환율 조회
//   - 인메모리 캐시 1시간 (API 호출 최소화)
//   - SOURCING_ALIEXPRESS_ENABLED=false 시 폴백 환율 반환
//     (Phase 5 비활성화 환경에서 API 키 없이 안전 동작)
//
// 환경변수:
//   EXCHANGE_RATE_API_KEY — ExchangeRate-API 키
//   SOURCING_ALIEXPRESS_ENABLED — 'true' 시 실제 API 호출
//
// ⚠️ Phase 5 활성화 전 반드시 EXCHANGE_RATE_API_KEY 설정 필요
// =============================================

import axios from 'axios'
import { config, createLogger } from '@smartstore/shared'

const logger = createLogger('exchange-rate')

export type SupportedCurrency = 'USD' | 'CNY'

/**
 * 비활성화 모드 폴백 환율 (Phase 5 비활성화 시 사용)
 * ⚠️ 실제 환율과 다를 수 있음 — Phase 5 활성화 전 반드시 실제 환율 확인
 */
const FALLBACK_RATES: Record<SupportedCurrency, number> = {
  USD: 1300,
  CNY: 180,
}

const CACHE_TTL_MS = 60 * 60 * 1000 // 1시간

interface CacheEntry {
  rate: number
  fetchedAt: number
}

/** 인메모리 환율 캐시 (통화 → 환율 + 조회 시각) */
const rateCache = new Map<SupportedCurrency, CacheEntry>()

/**
 * ExchangeRate-API v6에서 KRW 환율 조회
 * API 응답: { base_code: 'USD', conversion_rates: { KRW: 1300.5, CNY: 7.2, ... } }
 */
async function fetchFromApi(currency: SupportedCurrency, apiKey: string): Promise<number> {
  // USD 기준 API 호출 후 KRW, CNY → KRW 교차 계산
  const url = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`

  const response = await axios.get<{
    result: string
    conversion_rates: Record<string, number>
  }>(url, { timeout: 10000 })

  const rates = response.data.conversion_rates
  const krwPerUsd = rates['KRW']

  if (!krwPerUsd || krwPerUsd <= 0) {
    throw new Error('환율 API 응답에 KRW 데이터 없음')
  }

  if (currency === 'USD') {
    return krwPerUsd
  }

  // CNY: CNY/USD 역수 후 KRW 적용 → KRW/CNY
  const cnyPerUsd = rates['CNY']
  if (!cnyPerUsd || cnyPerUsd <= 0) {
    throw new Error('환율 API 응답에 CNY 데이터 없음')
  }

  return krwPerUsd / cnyPerUsd
}

/**
 * 지정 통화의 원화(KRW) 환율 반환
 *
 * @param currency 'USD' | 'CNY'
 * @returns 1외화 당 원화 (예: USD → 1300.5)
 *
 * 비활성화 모드: 폴백 환율 반환 (API 호출 없음)
 * 활성화 모드:   캐시 유효 시 캐시값, 만료 시 API 재조회
 */
export async function fetchExchangeRate(currency: SupportedCurrency): Promise<number> {
  if (!config.sourcing.aliexpressEnabled) {
    logger.debug('구매대행 비활성화 — 폴백 환율 반환', {
      currency,
      fallbackRate: FALLBACK_RATES[currency],
    })
    return FALLBACK_RATES[currency]
  }

  const apiKey = config.exchangeRate.apiKey
  if (!apiKey) {
    throw new Error(
      'EXCHANGE_RATE_API_KEY가 설정되지 않았습니다. ' +
      'Phase 5 활성화 전 .env에 EXCHANGE_RATE_API_KEY를 설정하세요.'
    )
  }

  // 캐시 확인
  const cached = rateCache.get(currency)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    logger.info('환율 캐시 사용', {
      currency,
      rate: cached.rate,
      ageMs: Date.now() - cached.fetchedAt,
    })
    return cached.rate
  }

  // API 호출
  logger.info('환율 API 조회', { currency })
  const rate = await fetchFromApi(currency, apiKey)

  rateCache.set(currency, { rate, fetchedAt: Date.now() })
  logger.info('환율 캐시 업데이트', { currency, rate })

  return rate
}

/**
 * 테스트/개발 용도: 캐시 초기화
 */
export function clearRateCache(): void {
  rateCache.clear()
}
