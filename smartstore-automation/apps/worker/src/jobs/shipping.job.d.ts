import { Worker } from 'bullmq';
/**
 * 발송 알림 워커
 * - 운송장 등록 → 네이버 발송 처리 → DB 업데이트 → 알림
 */
export declare function createShippingWorker(): Worker;
/**
 * 발송 대기 주문 목록 조회 (운송장 입력됐지만 알림 미발송)
 */
export declare function getOrdersReadyForShipping(): Promise<({
    product: {
        name: string;
    };
} & {
    id: string;
    salePrice: number;
    accountId: string;
    naverProductId: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    naverOrderId: string;
    productId: string;
    quantity: number;
    totalAmount: number;
    customerName: string;
    customerPhoneCiphertext: string;
    customerPhoneIv: string;
    customerPhoneAuthTag: string;
    customerAddress: string;
    customerZipCode: string;
    trackingNumber: string | null;
    courier: string | null;
    purchaseOrderId: string | null;
    marginAmount: number | null;
    marginRate: number | null;
    orderedAt: Date;
    paidAt: Date | null;
    shippedAt: Date | null;
    deliveredAt: Date | null;
    cancelledAt: Date | null;
})[]>;
//# sourceMappingURL=shipping.job.d.ts.map