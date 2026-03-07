// =============================================
// BullMQ 큐 정의 및 Redis 연결
// =============================================

import { Queue, QueueOptions } from 'bullmq'
import { config, createLogger } from '@smartstore/shared'
import type { NaverOrderItem } from '@smartstore/integrations'

const logger = createLogger('queues')

/** Redis 연결 설정 (워커에서도 import하여 사용) */
export const redisConnection = {
  host: config.redis.host,
  port: config.redis.port,
  ...(config.redis.password ? { password: config.redis.password } : {}),
}

/** 공통 큐 옵션 */
const defaultQueueOptions: QueueOptions = {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,                      // 최대 3회 재시도
    backoff: { type: 'exponential', delay: 5000 }, // 지수 백오프
    removeOnComplete: { count: 100 }, // 완료 작업 최대 100개 보관
    removeOnFail: { count: 500 },     // 실패 작업 최대 500개 보관
  },
}

// =============================
// 큐 선언
// =============================

/** 상품 등록 큐 */
export const registrationQueue = new Queue('product-registration', defaultQueueOptions)

/** 주문 처리 큐 */
export const orderQueue = new Queue('order-processing', defaultQueueOptions)

/** 발송 알림 큐 */
export const shippingNotificationQueue = new Queue('shipping-notification', {
  ...defaultQueueOptions,
  defaultJobOptions: {
    ...defaultQueueOptions.defaultJobOptions,
    priority: 1, // 발송 알림은 높은 우선순위
  },
})

/** 가격 모니터링 큐 */
export const priceMonitorQueue = new Queue('price-monitor', defaultQueueOptions)

/** 콘텐츠 생성 큐 (Phase 3 — LLM 상품 설명 자동 생성) */
export const contentGenerationQueue = new Queue('content-generation', defaultQueueOptions)

/** 환불 처리 큐 */
export const refundQueue = new Queue('refund-processing', defaultQueueOptions)

/** 네이버 톡톡 자동화 큐 */
export const talkTalkQueue = new Queue('talktalk-automation', defaultQueueOptions)

/** 도매 원가 변동 감지 큐 (P2-A) */
export const wholesaleWatcherQueue = new Queue('wholesale-watcher', defaultQueueOptions)

/** 블로그 포스팅 큐 (P3) */
export const blogPostingQueue = new Queue('blog-posting', defaultQueueOptions)

/** 재고 동기화 큐 */
export const inventorySyncQueue = new Queue('inventory-sync', defaultQueueOptions)

/** 재고 복구 큐 */
export const inventoryRecoveryQueue = new Queue('inventory-recovery', defaultQueueOptions)

/** 주문 승인 타임아웃 큐 (Phase 4.5) */
export const orderApprovalQueue = new Queue('order-approval', defaultQueueOptions)

// =============================
// 큐 이름 상수
// =============================

export const QUEUE_NAMES = {
  PRODUCT_REGISTRATION: 'product-registration',
  ORDER_PROCESSING: 'order-processing',
  SHIPPING_NOTIFICATION: 'shipping-notification',
  PRICE_MONITOR: 'price-monitor',
  CONTENT_GENERATION: 'content-generation',
  REFUND_PROCESSING: 'refund-processing',
  TALKTALK_AUTOMATION: 'talktalk-automation',
  WHOLESALE_WATCHER: 'wholesale-watcher',
  BLOG_POSTING: 'blog-posting',
  INVENTORY_SYNC: 'inventory-sync',
  INVENTORY_RECOVERY: 'inventory-recovery',
  ORDER_APPROVAL: 'order-approval',
} as const

// =============================
// 작업 데이터 타입
// =============================

/** 상품 등록 작업 데이터 */
export interface RegistrationJobData {
  productId: string   // DB 내부 상품 ID
  priority?: number
}

/** 주문 처리 작업 데이터 */
export interface OrderJobData {
  naverOrderId: string
  trigger: 'poll' | 'webhook'
  /** 폴링 시 전달되는 네이버 주문 아이템 (고객 정보 포함) */
  orderItem?: NaverOrderItem
  /** 운영 계정 ID (미전달 시 ENV ACCOUNT_ID → 'default' 순으로 fallback) */
  accountId?: string
}

/** 발송 알림 작업 데이터 */
export interface ShippingNotificationJobData {
  orderId: string
  productOrderId: string
  trackingNumber: string
  courier: string
  customerName: string
  productName: string
}

/** 가격 모니터링 작업 데이터 */
export interface PriceMonitorJobData {
  productId: string
  naverProductId: string
  currentPrice: number
  /** 운영 계정 ID */
  accountId: string
}

/** 콘텐츠 생성 작업 데이터 (Phase 3) */
export interface ContentJobData {
  productId: string
}

/** 환불 처리 작업 데이터 */
export interface RefundJobData {
  orderId: string
  type: 'refund' | 'exchange'
  reason: string
}

/** 네이버 톡톡 작업 데이터 */
export interface TalkTalkJobData {
  channelId: string
  customerId: string
  message: string
  messageType: string
}

/** 블로그 포스팅 작업 데이터 (P3) */
export interface BlogPostingJobData {
  /** DB 상품 ID (로깅용) */
  productId: string
  /** 상품명 */
  productName: string
  /** 카테고리 */
  category: string
  /** 판매가 (원) */
  salePrice: number
  /** 상품 설명 (선택) */
  description?: string
}

/** 재고 동기화 작업 데이터 */
export interface InventorySyncJobData {
  productId: string
  source: 'domaegguk' | 'ownerclan'
  sourceProductId: string
}

/** 재고 복구 작업 데이터 */
export interface InventoryRecoveryJobData {
  productId: string
}

/** 주문 승인 타임아웃 작업 데이터 (Phase 4.5) */
export interface OrderApprovalJobData {
  orderId: string
  approvalToken: string
  action: 'check_timeout'
}

/** 도매 원가 변동 감지 작업 데이터 (P2-A) */
export interface WholesaleWatcherJobData {
  /** DB 상품 ID */
  productId: string
  /** 현재 DB 저장 도매가 */
  currentWholesalePrice: number
  /** 크롤링으로 수집한 최신 도매가 */
  crawledWholesalePrice: number
  /** 운영 계정 ID */
  accountId: string
}

logger.info('BullMQ 큐 초기화 완료', {
  queues: Object.values(QUEUE_NAMES),
  redis: `${config.redis.host}:${config.redis.port}`,
})
