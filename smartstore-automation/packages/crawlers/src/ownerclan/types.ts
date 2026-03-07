// =============================================
// 오너클랜 크롤러 타입 정의
// =============================================

/** 오너클랜 크롤링 수집 상품 */
export interface OwnerclanProduct {
  sourceProductId: string
  name: string
  category: string
  wholesalePrice: number
  shippingFee: number
  imageUrl: string
  detailUrl: string
  stockQuantity: number
  minOrderQuantity: number
}

/** 크롤러 옵션 */
export interface OwnerclanCrawlerOptions {
  headless?: boolean
  minDelayMs?: number
  maxDelayMs?: number
  maxPages?: number
}
