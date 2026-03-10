// =============================================
// 오너클랜 자동 주문 타입 정의
// =============================================

import type { WholesaleOrderRequest, WholesaleOrderResult, WholesaleOrderer } from '../wholesale-order-types'

export type { WholesaleOrderRequest, WholesaleOrderResult, WholesaleOrderer }

/** 오너클랜 주문자 옵션 */
export interface OwnerclanOrdererOptions {
  readonly headless?: boolean
  readonly minDelayMs?: number
  readonly maxDelayMs?: number
}
