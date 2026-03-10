// =============================================
// 네이버 쇼핑 크롤러 헬스체크 + 모바일 fallback
//
// 비유: 정문이 잠기면 후문으로 들어간다.
// 데스크톱 셀렉터가 깨지면 모바일 URL로 전환.
// 헬스체크로 어느 문이 열려있는지 주기적 확인.
// =============================================

/** 모바일 네이버 쇼핑 URL */
const MOBILE_SHOPPING_BASE = 'https://msearch.shopping.naver.com'

/** 모바일 상품 목록 셀렉터 (모바일은 구조가 더 단순하고 안정적) */
export const MOBILE_PRODUCT_SELECTORS = [
  '[class*="product_item"]',
  '[class*="productItem"]',
  '[class*="item_inner"]',
  'li[class*="_item"]',
] as const

/** 모바일 가격 셀렉터 */
export const MOBILE_PRICE_SELECTORS = [
  '[class*="price"]',
  '[class*="num"]',
  '[class*="amount"]',
] as const

/** 모바일 판매자 셀렉터 */
export const MOBILE_SELLER_SELECTORS = [
  '[class*="mall"]',
  '[class*="seller"]',
  '[class*="store"]',
] as const

/**
 * 모바일 검색 URL 생성
 */
export function buildMobileSearchUrl(
  keyword: string,
  sort: 'rel' | 'price_asc' | 'price_dsc' | 'date' = 'rel',
): string {
  return `${MOBILE_SHOPPING_BASE}/search/all?query=${encodeURIComponent(keyword)}&sort=${sort}`
}

/** 헬스체크 입력 */
export interface SelectorHealthInput {
  readonly desktopMatched: number
  readonly mobileMatched: number
  readonly timestamp: number
}

/** 헬스체크 결과 */
export interface SelectorHealthResult {
  readonly desktopHealthy: boolean
  readonly mobileHealthy: boolean
  readonly recommendation: string
  readonly timestamp: number
}

/**
 * 셀렉터 건강 상태 판단
 *
 * 규칙:
 *   - 데스크톱 매칭 > 0 → 정상
 *   - 데스크톱 0, 모바일 > 0 → 모바일 fallback 사용 권장
 *   - 둘 다 0 → 수동 확인 필요 (셀렉터 전면 개편 또는 봇 차단)
 */
export function checkSelectorHealth(input: SelectorHealthInput): SelectorHealthResult {
  const desktopHealthy = input.desktopMatched > 0
  const mobileHealthy = input.mobileMatched > 0

  let recommendation: string
  if (desktopHealthy) {
    recommendation = '데스크톱 셀렉터 정상 작동 중'
  } else if (mobileHealthy) {
    recommendation = '데스크톱 셀렉터 깨짐 — 모바일 fallback 사용 권장'
  } else {
    recommendation = '데스크톱/모바일 모두 실패 — 수동 셀렉터 확인 필요'
  }

  return {
    desktopHealthy,
    mobileHealthy,
    recommendation,
    timestamp: input.timestamp,
  }
}
