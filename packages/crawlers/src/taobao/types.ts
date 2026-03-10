// =============================================
// 타오바오 크롤러 타입 정의
// =============================================

/** 타오바오 크롤링 수집 상품 */
export interface TaobaoProduct {
  sourceProductId: string
  name: string
  category: string
  overseasPrice: number    // CNY 단위
  currency: 'CNY'
  shippingFee: number      // CNY 단위
  imageUrl: string
  detailUrl: string
  monthlySales: number     // 월 판매량
  storeName: string
  storeRating: number      // 매장 평점
}

/** 크롤러 옵션 */
export interface TaobaoCrawlerOptions {
  headless?: boolean
  minDelayMs?: number
  maxDelayMs?: number
  maxPages?: number
  /** 쿠키 문자열 (로그인 세션 유지 필수) */
  cookieString?: string
  /** 최소 월 판매량 필터 */
  minMonthlySales?: number
}
