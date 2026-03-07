// =============================================
// API 서버 전용 BullMQ 큐 (프로듀서 역할)
//
// 비유: 편의점(api-server)의 주문 접수대.
// 접수만 하고, 실제 조리(처리)는 주방(worker)이 한다.
// 둘 다 같은 주문표(Redis 큐 이름)를 공유하므로 연결된다.
//
// 왜 worker에서 재수출하지 않는가?
//   TypeScript rootDir 제약 — 다른 앱 소스를 import하면
//   "File is not under rootDir" 에러 발생.
//   BullMQ Queue는 이름 기반이므로 동일 이름 = 동일 큐.
// =============================================

import { Queue } from 'bullmq'
import { config } from '@smartstore/shared'
import type { NaverOrderItem } from '@smartstore/integrations'

// =============================
// Redis 연결
// =============================

const redisConnection = {
  host: config.redis.host,
  port: config.redis.port,
  ...(config.redis.password ? { password: config.redis.password } : {}),
}

const defaultQueueOptions = {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
}

// =============================
// 큐 인스턴스 (프로듀서)
// =============================

export const registrationQueue = new Queue('product-registration', defaultQueueOptions)
export const orderQueue = new Queue('order-processing', defaultQueueOptions)
export const shippingNotificationQueue = new Queue('shipping-notification', defaultQueueOptions)
export const priceMonitorQueue = new Queue('price-monitor', defaultQueueOptions)
export const inventorySyncQueue = new Queue('inventory-sync', defaultQueueOptions)
export const orderApprovalQueue = new Queue('order-approval', defaultQueueOptions)

// =============================
// 큐 이름 상수
// =============================

export const QUEUE_NAMES = {
  PRODUCT_REGISTRATION: 'product-registration',
  ORDER_PROCESSING: 'order-processing',
  SHIPPING_NOTIFICATION: 'shipping-notification',
  PRICE_MONITOR: 'price-monitor',
  INVENTORY_SYNC: 'inventory-sync',
  ORDER_APPROVAL: 'order-approval',
} as const

// =============================
// 작업 데이터 타입
// =============================

export interface RegistrationJobData {
  productId: string
  priority?: number
}

export interface OrderJobData {
  naverOrderId: string
  trigger: 'poll' | 'webhook'
  orderItem?: NaverOrderItem
  accountId?: string
}

export interface ShippingNotificationJobData {
  orderId: string
  productOrderId: string
  trackingNumber: string
  courier: string
  customerName: string
  productName: string
}

export interface PriceMonitorJobData {
  productId: string
  naverProductId: string
  currentPrice: number
  accountId: string
}

export interface InventorySyncJobData {
  productId: string
  source: 'domaegguk' | 'ownerclan'
  sourceProductId: string
}

export interface OrderApprovalJobData {
  orderId: string
  approvalToken: string
  action: 'check_timeout'
}
