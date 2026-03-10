// =============================================
// 네이버 주문 처리 서비스
// - 새 주문 폴링
// - 발송 처리 (운송장 등록)
// - 주문 상태 동기화
// =============================================

import { createLogger } from '@smartstore/shared'
import type { Order, OrderStatus } from '@smartstore/shared'
import { naverCommerceApi } from './commerce-api'
import type { NaverOrderItem } from './types'

const logger = createLogger('naver-order')

/** 택배사 코드 매핑 (네이버 표준 코드) */
const COURIER_CODES: Record<string, string> = {
  'CJ대한통운': 'CJGLS',
  '롯데택배': 'LOTTE',
  '한진택배': 'HANJIN',
  'GS택배': 'CVS',
  '우체국택배': 'EPOST',
  '로젠택배': 'ILOGEN',
}

/**
 * 새 주문(결제 완료) 조회
 * - 폴링 방식으로 주기적 호출
 */
export async function fetchNewOrders(): Promise<NaverOrderItem[]> {
  try {
    logger.debug('새 주문 조회 중')
    const response = await naverCommerceApi.getNewOrders()
    logger.info(`새 주문 ${response.data.length}건 조회`)
    return response.data
  } catch (error) {
    logger.error('주문 조회 실패', error)
    return []
  }
}

/**
 * 네이버 주문 아이템 → 내부 Order 형식 변환
 */
export function mapNaverOrderToInternal(item: NaverOrderItem): Omit<Order, 'productId'> {
  return {
    orderId: item.productOrderId,
    naverProductId: item.productId,
    quantity: item.quantity,
    salePrice: item.salePrice,
    status: mapNaverStatusToInternal(item.productOrderStatus),
    customerName: item.shippingAddress?.name ?? '',
    customerPhone: item.shippingAddress?.tel ?? '',  // @encrypted - DB 저장 시 암호화 필수
    customerAddress: [
      item.shippingAddress?.baseAddress,
      item.shippingAddress?.detailAddress,
    ]
      .filter(Boolean)
      .join(' '),
    orderedAt: new Date(item.orderDate),
    paidAt: item.paymentDate ? new Date(item.paymentDate) : undefined,
    shippedAt: item.shippingDate ? new Date(item.shippingDate) : undefined,
    trackingNumber: item.trackingNumber,
    courier: item.logisticsCompanyCode,
  }
}

/**
 * 네이버 주문 상태 → 내부 상태 코드 변환
 */
function mapNaverStatusToInternal(naverStatus: string): OrderStatus {
  const mapping: Record<string, OrderStatus> = {
    PAYMENT_WAITING: 'payment_waiting',
    PAY_DONE: 'paid',
    PAYED: 'paid',
    DELIVERING: 'shipped',
    DELIVERED: 'delivered',
    PURCHASE_DECIDED: 'delivered',
    EXCHANGE_REQUESTED: 'return_requested',
    CANCEL_REQUESTED: 'cancelled',
    CANCELED: 'cancelled',
    RETURN_REQUESTED: 'return_requested',
    RETURNED: 'returned',
  }

  return mapping[naverStatus] ?? 'paid'
}

/**
 * 발송 확인 처리 (운송장 번호 등록)
 */
export async function confirmShipping(
  productOrderId: string,
  courierName: string,
  trackingNumber: string
): Promise<boolean> {
  const courierCode = COURIER_CODES[courierName]

  if (!courierCode) {
    logger.error('알 수 없는 택배사', { courierName })
    return false
  }

  try {
    await naverCommerceApi.confirmShipping({
      dispatchProductOrders: [
        {
          productOrderId,
          deliveryMethod: 'DELIVERY',
          deliveryCompanyCode: courierCode,
          trackingNumber,
        },
      ],
    })

    logger.info('발송 처리 완료', { productOrderId, trackingNumber })
    return true
  } catch (error) {
    logger.error('발송 처리 실패', { productOrderId, error })
    return false
  }
}

/**
 * 여러 주문 일괄 발송 처리
 */
export async function confirmShippingBatch(
  orders: Array<{
    productOrderId: string
    courierName: string
    trackingNumber: string
  }>
): Promise<{ success: number; failed: number }> {
  let success = 0
  let failed = 0

  // 네이버 API는 한 번에 최대 50건 처리 가능
  const BATCH_SIZE = 50
  const batches = chunkArray(orders, BATCH_SIZE)

  for (const batch of batches) {
    const validOrders = batch.filter((o) => COURIER_CODES[o.courierName])
    const invalidOrders = batch.filter((o) => !COURIER_CODES[o.courierName])

    failed += invalidOrders.length

    if (validOrders.length === 0) continue

    try {
      await naverCommerceApi.confirmShipping({
        dispatchProductOrders: validOrders.map((o) => ({
          productOrderId: o.productOrderId,
          deliveryMethod: 'DELIVERY',
          deliveryCompanyCode: COURIER_CODES[o.courierName]!,
          trackingNumber: o.trackingNumber,
        })),
      })
      success += validOrders.length
    } catch (error) {
      logger.error('배치 발송 처리 실패', { error })
      failed += validOrders.length
    }
  }

  logger.info(`일괄 발송 결과: 성공 ${success}, 실패 ${failed}`)
  return { success, failed }
}

/** 배열을 청크로 나누기 */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}
