// =============================================
// 온채널 주문 자동화 전용 타입
// =============================================

import type { WholesaleOrderRequest, WholesaleOrderResult } from '../wholesale-order-types'

/** 온채널 주문자 옵션 */
export interface OnchannelOrdererOptions {
  readonly headless?: boolean
  readonly minDelayMs?: number
  readonly maxDelayMs?: number
}

/** 온채널 주문 상세 (주문 결과 확장) */
export interface OnchannelOrderDetail {
  readonly wholesaleOrderId: string
  readonly productName: string
  readonly quantity: number
  readonly totalPrice: number
  readonly orderedAt: string
  readonly trackingNumber: string | null
  readonly trackingCarrier: string | null
}

/** 온채널 로그인 상태 */
export interface OnchannelLoginState {
  readonly isLoggedIn: boolean
  readonly storageStatePath: string | null
}

export type { WholesaleOrderRequest, WholesaleOrderResult }
