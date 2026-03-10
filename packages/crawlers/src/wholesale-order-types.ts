// 도매처 자동 주문 공통 타입

/** 도매처 주문 요청 */
export interface WholesaleOrderRequest {
  sourceProductId: string
  quantity: number
  shippingAddress: {
    name: string
    phone: string
    address: string
    zipCode: string
  }
  productOptions?: Record<string, string>
}

/** 도매처 주문 결과 */
export interface WholesaleOrderResult {
  success: boolean
  wholesaleOrderId?: string
  errorMessage?: string
  screenshotPath?: string
}

/** 도매처 주문 자동화 인터페이스 */
export interface WholesaleOrderer {
  login(): Promise<void>
  placeOrder(request: WholesaleOrderRequest): Promise<WholesaleOrderResult>
  getTrackingNumber(wholesaleOrderId: string): Promise<string | null>
  close(): Promise<void>
}
