import type { Order } from '@smartstore/shared';
import type { NaverOrderItem } from './types';
/**
 * 새 주문(결제 완료) 조회
 * - 폴링 방식으로 주기적 호출
 */
export declare function fetchNewOrders(): Promise<NaverOrderItem[]>;
/**
 * 네이버 주문 아이템 → 내부 Order 형식 변환
 */
export declare function mapNaverOrderToInternal(item: NaverOrderItem): Omit<Order, 'productId'>;
/**
 * 발송 확인 처리 (운송장 번호 등록)
 */
export declare function confirmShipping(productOrderId: string, courierName: string, trackingNumber: string): Promise<boolean>;
/**
 * 여러 주문 일괄 발송 처리
 */
export declare function confirmShippingBatch(orders: Array<{
    productOrderId: string;
    courierName: string;
    trackingNumber: string;
}>): Promise<{
    success: number;
    failed: number;
}>;
//# sourceMappingURL=order.d.ts.map