/** 상품 소싱 타입 (위탁판매 / 구매대행) */
export type SourcingType = 'wholesale' | 'overseas';
/** 상품 상태 */
export type ProductStatus = 'pending' | 'registered' | 'active' | 'suspended' | 'deleted';
/** 도매 공급처 */
export type WholesaleSource = 'domaegguk' | 'ownerclan';
/** 원시 크롤링 상품 데이터 */
export interface RawProduct {
    sourceId: string;
    source: WholesaleSource;
    name: string;
    wholesalePrice: number;
    shippingFee: number;
    category: string;
    images: string[];
    options?: ProductOption[];
    stockQuantity: number;
    description?: string;
}
/** 상품 옵션 */
export interface ProductOption {
    name: string;
    values: string[];
}
/** 네이버 등록용 상품 데이터 */
export interface NaverProduct {
    id?: string;
    name: string;
    salePrice: number;
    category: NaverCategory;
    images: string[];
    description: string;
    options?: NaverProductOption[];
    stockQuantity: number;
    deliveryInfo: DeliveryInfo;
}
/** 네이버 카테고리 */
export interface NaverCategory {
    id: string;
    name: string;
}
/** 네이버 상품 옵션 */
export interface NaverProductOption {
    groupName: string;
    options: Array<{
        value: string;
        price: number;
        stockQuantity: number;
    }>;
}
/** 배송 정보 */
export interface DeliveryInfo {
    deliveryFee: number;
    deliveryType: 'FREE' | 'PAID' | 'CONDITIONAL_FREE';
    minOrderAmountForFree?: number;
}
/** 주문 상태 */
export type OrderStatus = 'payment_waiting' | 'paid' | 'preparing' | 'shipped' | 'delivered' | 'cancelled' | 'return_requested' | 'returned';
/** 주문 데이터 */
export interface Order {
    orderId: string;
    productId: string;
    naverProductId: string;
    quantity: number;
    salePrice: number;
    status: OrderStatus;
    customerName: string;
    customerPhone: string;
    customerAddress: string;
    orderedAt: Date;
    paidAt?: Date;
    shippedAt?: Date;
    deliveredAt?: Date;
    trackingNumber?: string;
    courier?: string;
}
/** 발주 정보 (공급사에 전달) */
export interface PurchaseOrder {
    orderId: string;
    source: WholesaleSource;
    sourceProductId: string;
    quantity: number;
    shippingAddress: {
        name: string;
        phone: string;
        address: string;
        zipCode: string;
    };
}
/** 위탁판매 가격 계산 입력값 */
export interface WholesalePriceInput {
    wholesalePrice: number;
    shippingFee: number;
    naverFeeRate: number;
    targetMarginRate: number;
}
/** 가격 계산 결과 */
export interface PriceCalculationResult {
    salePrice: number;
    cost: number;
    margin: number;
    marginRate: number;
    naverFee: number;
}
/** 경쟁 상품 가격 정보 */
export interface CompetitorPrice {
    productId: string;
    naverProductId: string;
    competitorName: string;
    price: number;
    rank?: number;
    checkedAt: Date;
}
/** 가격 조정 결과 */
export interface PriceAdjustmentResult {
    productId: string;
    oldPrice: number;
    newPrice: number;
    reason: string;
    adjustedAt: Date;
}
/** 알림 유형 */
export type NotificationType = 'order_received' | 'order_shipped' | 'price_adjusted' | 'stock_low' | 'system_error' | 'blog_posted' | 'content_generated' | 'wholesale_price_changed' | `refund_${string}`;
/** 알림 메시지 */
export interface Notification {
    type: NotificationType;
    title: string;
    message: string;
    data?: Record<string, unknown>;
}
/** 성공/실패를 명시적으로 표현하는 Result 타입 */
export type Result<T, E = Error> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: E;
};
export declare const Ok: <T>(value: T) => Result<T>;
export declare const Err: <E = Error>(error: E) => Result<never, E>;
//# sourceMappingURL=types.d.ts.map