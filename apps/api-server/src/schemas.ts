// =============================================
// API 입력 검증 스키마 (Zod)
// =============================================

import { z } from 'zod'

/** POST /products — 상품 수동 등록 */
export const createProductSchema = z.object({
  source: z.enum(['domaegguk', 'ownerclan', 'onchannel'], { message: '지원하는 소스: domaegguk, ownerclan, onchannel' }),
  sourceProductId: z.string().min(1, '소스 상품 ID 필수'),
  name: z.string().min(1, '상품명 필수').max(200, '상품명 200자 이하'),
  wholesalePrice: z.number().positive('도매가는 양수'),
  shippingFee: z.number().min(0, '배송비는 0 이상'),
  naverFeeRate: z.number().min(0).max(1, '수수료율 0~1'),
  targetMarginRate: z.number().min(0.15, '마진율 15% 이상').max(0.9, '마진율 90% 이하'),
  naverCategoryId: z.string().optional(),
  images: z.array(z.string().url('유효한 URL')).min(1, '이미지 1개 이상'),
  description: z.string().optional(),
  stockQuantity: z.number().int().positive().optional(),
})

/** POST /orders/:id/ship — 배송 처리 */
export const shipOrderSchema = z.object({
  trackingNumber: z.string().min(1, '운송장 번호 필수'),
  courier: z.string().min(1, '택배사 필수'),
})

/** POST /admin/control — Kill Switch 제어 */
export const controlSchema = z.object({
  key: z.enum(['AUTO_PRICE_ENABLED', 'AUTO_ORDER_ENABLED', 'AUTO_SHIPPING_ENABLED', 'SELLER_TYPE']),
  value: z.string().min(1, '값 필수'),
})

/** PUT /admin/credentials/:service — 자격증명 저장 */
export const saveCredentialsSchema = z.object({
  credentials: z.record(z.string(), z.string()),
})

/** POST /webhooks/naver — 웹훅 수신 */
export const naverWebhookSchema = z.object({
  productOrderId: z.string().min(1, 'productOrderId 필수'),
})

/** POST /webhooks/talktalk — 톡톡 메시지 웹훅 */
export const talkTalkWebhookSchema = z.object({
  eventType: z.enum(['MESSAGE_RECEIVED', 'MESSAGE_READ', 'CUSTOMER_JOINED']),
  storeId: z.string().min(1),
  channelId: z.string().min(1),
  customerId: z.string().min(1),
  message: z.string().optional(),
  messageType: z.enum(['TEXT', 'IMAGE', 'FILE']).default('TEXT'),
  timestamp: z.string().or(z.date()).optional(),
})

export type TalkTalkWebhookInput = z.infer<typeof talkTalkWebhookSchema>

export type CreateProductInput = z.infer<typeof createProductSchema>
export type ShipOrderInput = z.infer<typeof shipOrderSchema>
export type ControlInput = z.infer<typeof controlSchema>
export type SaveCredentialsInput = z.infer<typeof saveCredentialsSchema>
