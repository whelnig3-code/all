// =============================================
// AliExpress 크롤러 타입 정의
// =============================================

/** AliExpress 크롤링 수집 상품 */
export interface AliexpressProduct {
  sourceProductId: string
  name: string
  category: string
  overseasPrice: number    // USD 단위
  currency: 'USD'
  shippingFee: number      // USD 단위 (무료배송이면 0)
  imageUrl: string
  detailUrl: string
  rating: number           // 0~5
  orderCount: number       // 판매 수량
  storeName: string
}

/** 크롤러 옵션 */
export interface AliexpressCrawlerOptions {
  headless?: boolean
  minDelayMs?: number
  maxDelayMs?: number
  maxPages?: number
  /** 프록시 URL 리스트 (봇 감지 대응) */
  proxyUrls?: string[]
  /** 최소 주문수 필터 (신뢰도 기준) */
  minOrders?: number
  /** 최소 평점 필터 */
  minRating?: number
}
