"use strict";
// =============================================
// BullMQ 큐 정의 및 Redis 연결
// =============================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUEUE_NAMES = exports.blogPostingQueue = exports.wholesaleWatcherQueue = exports.talkTalkQueue = exports.refundQueue = exports.contentGenerationQueue = exports.priceMonitorQueue = exports.shippingNotificationQueue = exports.orderQueue = exports.registrationQueue = void 0;
const bullmq_1 = require("bullmq");
const shared_1 = require("@smartstore/shared");
const logger = (0, shared_1.createLogger)('queues');
/** Redis 연결 설정 */
const redisConnection = {
    host: shared_1.config.redis.host,
    port: shared_1.config.redis.port,
    ...(shared_1.config.redis.password ? { password: shared_1.config.redis.password } : {}),
};
/** 공통 큐 옵션 */
const defaultQueueOptions = {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3, // 최대 3회 재시도
        backoff: { type: 'exponential', delay: 5000 }, // 지수 백오프
        removeOnComplete: { count: 100 }, // 완료 작업 최대 100개 보관
        removeOnFail: { count: 500 }, // 실패 작업 최대 500개 보관
    },
};
// =============================
// 큐 선언
// =============================
/** 상품 등록 큐 */
exports.registrationQueue = new bullmq_1.Queue('product-registration', defaultQueueOptions);
/** 주문 처리 큐 */
exports.orderQueue = new bullmq_1.Queue('order-processing', defaultQueueOptions);
/** 발송 알림 큐 */
exports.shippingNotificationQueue = new bullmq_1.Queue('shipping-notification', {
    ...defaultQueueOptions,
    defaultJobOptions: {
        ...defaultQueueOptions.defaultJobOptions,
        priority: 1, // 발송 알림은 높은 우선순위
    },
});
/** 가격 모니터링 큐 */
exports.priceMonitorQueue = new bullmq_1.Queue('price-monitor', defaultQueueOptions);
/** 콘텐츠 생성 큐 (Phase 3 — LLM 상품 설명 자동 생성) */
exports.contentGenerationQueue = new bullmq_1.Queue('content-generation', defaultQueueOptions);
/** 환불 처리 큐 */
exports.refundQueue = new bullmq_1.Queue('refund-processing', defaultQueueOptions);
/** 네이버 톡톡 자동화 큐 */
exports.talkTalkQueue = new bullmq_1.Queue('talktalk-automation', defaultQueueOptions);
/** 도매 원가 변동 감지 큐 (P2-A) */
exports.wholesaleWatcherQueue = new bullmq_1.Queue('wholesale-watcher', defaultQueueOptions);
/** 블로그 포스팅 큐 (P3) */
exports.blogPostingQueue = new bullmq_1.Queue('blog-posting', defaultQueueOptions);
// =============================
// 큐 이름 상수
// =============================
exports.QUEUE_NAMES = {
    PRODUCT_REGISTRATION: 'product-registration',
    ORDER_PROCESSING: 'order-processing',
    SHIPPING_NOTIFICATION: 'shipping-notification',
    PRICE_MONITOR: 'price-monitor',
    CONTENT_GENERATION: 'content-generation',
    REFUND_PROCESSING: 'refund-processing',
    TALKTALK_AUTOMATION: 'talktalk-automation',
    WHOLESALE_WATCHER: 'wholesale-watcher',
    BLOG_POSTING: 'blog-posting',
};
logger.info('BullMQ 큐 초기화 완료', {
    queues: Object.values(exports.QUEUE_NAMES),
    redis: `${shared_1.config.redis.host}:${shared_1.config.redis.port}`,
});
//# sourceMappingURL=queues.js.map