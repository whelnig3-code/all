// =============================================
// 네이버 쇼핑 크롤러 헬스체크 + 모바일 fallback 테스트 (TDD)
//
// A-1: 셀렉터가 깨지면 감지하고, 모바일 URL로 fallback
// =============================================

import {
  checkSelectorHealth,
  buildMobileSearchUrl,
  MOBILE_PRODUCT_SELECTORS,
  MOBILE_PRICE_SELECTORS,
} from './naver-shopping-health'

describe('buildMobileSearchUrl', () => {
  it('키워드 → 모바일 검색 URL 생성', () => {
    const url = buildMobileSearchUrl('드릴비트')
    expect(url).toContain('msearch.shopping.naver.com')
    expect(url).toContain(encodeURIComponent('드릴비트'))
  })

  it('가격순 정렬 옵션', () => {
    const url = buildMobileSearchUrl('그라인더', 'price_asc')
    expect(url).toContain('sort=price_asc')
  })

  it('기본 정렬은 관련도순', () => {
    const url = buildMobileSearchUrl('그라인더')
    expect(url).toContain('sort=rel')
  })
})

describe('MOBILE_PRODUCT_SELECTORS', () => {
  it('셀렉터 후보가 3개 이상', () => {
    expect(MOBILE_PRODUCT_SELECTORS.length).toBeGreaterThanOrEqual(3)
  })

  it('모든 셀렉터가 문자열', () => {
    for (const sel of MOBILE_PRODUCT_SELECTORS) {
      expect(typeof sel).toBe('string')
    }
  })
})

describe('MOBILE_PRICE_SELECTORS', () => {
  it('셀렉터 후보가 2개 이상', () => {
    expect(MOBILE_PRICE_SELECTORS.length).toBeGreaterThanOrEqual(2)
  })
})

describe('checkSelectorHealth', () => {
  it('결과 객체에 desktop/mobile 상태 포함', () => {
    // 실제 브라우저 없이 구조만 검증
    const result = checkSelectorHealth({
      desktopMatched: 0,
      mobileMatched: 3,
      timestamp: Date.now(),
    })

    expect(result.desktopHealthy).toBe(false)
    expect(result.mobileHealthy).toBe(true)
    expect(result.recommendation).toContain('모바일')
  })

  it('둘 다 0건 → 전체 불건전', () => {
    const result = checkSelectorHealth({
      desktopMatched: 0,
      mobileMatched: 0,
      timestamp: Date.now(),
    })

    expect(result.desktopHealthy).toBe(false)
    expect(result.mobileHealthy).toBe(false)
    expect(result.recommendation).toContain('수동')
  })

  it('데스크톱 정상 → 모바일 불필요', () => {
    const result = checkSelectorHealth({
      desktopMatched: 5,
      mobileMatched: 0,
      timestamp: Date.now(),
    })

    expect(result.desktopHealthy).toBe(true)
    expect(result.recommendation).toContain('정상')
  })
})
