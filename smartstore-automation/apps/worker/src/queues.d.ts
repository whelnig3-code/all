import { Queue } from 'bullmq';
import type { NaverOrderItem } from '@smartstore/integrations';
/** 상품 등록 큐 */
export declare const registrationQueue: Queue<any, any, string, any, any, string>;
/** 주문 처리 큐 */
export declare const orderQueue: Queue<any, any, string, any, any, string>;
/** 발송 알림 큐 */
export declare const shippingNotificationQueue: Queue<any, any, string, any, any, string>;
/** 가격 모니터링 큐 */
export declare const priceMonitorQueue: Queue<any, any, string, any, any, string>;
/** 콘텐츠 생성 큐 (Phase 3 — LLM 상품 설명 자동 생성) */
export declare const contentGenerationQueue: Queue<any, any, string, any, any, string>;
/** 환불 처리 큐 */
export declare const refundQueue: Queue<any, any, string, any, any, string>;
/** 네이버 톡톡 자동화 큐 */
export declare const talkTalkQueue: Queue<any, any, string, any, any, string>;
/** 도매 원가 변동 감지 큐 (P2-A) */
export declare const wholesaleWatcherQueue: Queue<any, any, string, any, any, string>;
/** 블로그 포스팅 큐 (P3) */
export declare const blogPostingQueue: Queue<any, any, string, any, any, string>;
export declare const QUEUE_NAMES: {
    readonly PRODUCT_REGISTRATION: "product-registration";
    readonly ORDER_PROCESSING: "order-processing";
    readonly SHIPPING_NOTIFICATION: "shipping-notification";
    readonly PRICE_MONITOR: "price-monitor";
    readonly CONTENT_GENERATION: "content-generation";
    readonly REFUND_PROCESSING: "refund-processing";
    readonly TALKTALK_AUTOMATION: "talktalk-automation";
    readonly WHOLESALE_WATCHER: "wholesale-watcher";
    readonly BLOG_POSTING: "blog-posting";
};
/** 상품 등록 작업 데이터 */
export interface RegistrationJobData {
    productId: string;
    priority?: number;
}
/** 주문 처리 작업 데이터 */
export interface OrderJobData {
    naverOrderId: string;
    trigger: 'poll' | 'webhook';
    /** 폴링 시 전달되는 네이버 주문 아이템 (고객 정보 포함) */
    orderItem?: NaverOrderItem;
    /** 운영 계정 ID (미전달 시 ENV ACCOUNT_ID → 'default' 순으로 fallback) */
    accountId?: string;
}
/** 발송 알림 작업 데이터 */
export interface ShippingNotificationJobData {
    orderId: string;
    productOrderId: string;
    trackingNumber: string;
    courier: string;
    customerName: string;
    productName: string;
}
/** 가격 모니터링 작업 데이터 */
export interface PriceMonitorJobData {
    productId: string;
    naverProductId: string;
    currentPrice: number;
    /** 운영 계정 ID */
    accountId: string;
}
/** 콘텐츠 생성 작업 데이터 (Phase 3) */
export interface ContentJobData {
    productId: string;
}
/** 환불 처리 작업 데이터 */
export interface RefundJobData {
    orderId: string;
    type: 'refund' | 'exchange';
    reason: string;
}
/** 네이버 톡톡 작업 데이터 */
export interface TalkTalkJobData {
    channelId: string;
    customerId: string;
    message: string;
    messageType: string;
}
/** 블로그 포스팅 작업 데이터 (P3) */
export interface BlogPostingJobData {
    /** DB 상품 ID (로깅용) */
    productId: string;
    /** 상품명 */
    productName: string;
    /** 카테고리 */
    category: string;
    /** 판매가 (원) */
    salePrice: number;
    /** 상품 설명 (선택) */
    description?: string;
}
/** 도매 원가 변동 감지 작업 데이터 (P2-A) */
export interface WholesaleWatcherJobData {
    /** DB 상품 ID */
    productId: string;
    /** 현재 DB 저장 도매가 */
    currentWholesalePrice: number;
    /** 크롤링으로 수집한 최신 도매가 */
    crawledWholesalePrice: number;
    /** 운영 계정 ID */
    accountId: string;
}
//# sourceMappingURL=queues.d.ts.map