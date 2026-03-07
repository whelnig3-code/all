// =============================================
// 도매꾹 크롤러 타입 정의
// =============================================

/** 도매꾹 크롤링 수집 상품 */
export interface DomaeggukProduct {
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
export interface DomaeggukCrawlerOptions {
  headless?: boolean
  minDelayMs?: number
  maxDelayMs?: number
  maxPages?: number
}
