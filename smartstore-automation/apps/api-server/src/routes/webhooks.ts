// =============================================
// 네이버 웹훅 수신 엔드포인트
// POST /webhooks/naver
// =============================================

import type { FastifyPluginAsync } from 'fastify'
import * as crypto from 'crypto'
import { config, createLogger } from '@smartstore/shared'
import { orderQueue, type OrderJobData } from '../queues'
import { naverWebhookSchema } from '../schemas'

const logger = createLogger('webhook')

/**
 * 네이버 웹훅 HMAC-SHA256 서명 검증
 * - 비유: 택배 기사가 신분증(서명)을 보여줘야 문을 열어주는 것
 * - rawBody를 clientSecret으로 HMAC 계산 후 헤더 서명과 비교
 */
function verifyNaverWebhookSignature(
  signature: string | undefined,
  rawBody: string | undefined,
): boolean {
  if (!signature || !rawBody) return false

  const expected = crypto
    .createHmac('sha256', config.naver.clientSecret)
    .update(rawBody)
    .digest('base64')

  return crypto.timingSafeEqual(
    Buffer.from(signature, 'base64'),
    Buffer.from(expected, 'base64'),
  )
}

export const webhooksRouter: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /webhooks/naver
   * 네이버 커머스 주문 이벤트 웹훅 수신
   *
   * payload 예시: { "productOrderId": "2024xxxxxxxx" }
   */
  fastify.post('/naver', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    // 웹훅 서명 검증 (X-Naver-Signature 헤더)
    const signature = request.headers['x-naver-signature'] as string | undefined
    const rawBody = (request as any).rawBody as string | undefined

    if (!verifyNaverWebhookSignature(signature, rawBody)) {
      logger.warn('웹훅 서명 검증 실패', {
        hasSignature: !!signature,
        ip: request.ip,
      })
      return reply.code(401).send({ error: '웹훅 서명 검증 실패' })
    }

    // Zod 입력 검증
    const parsed = naverWebhookSchema.safeParse(request.body)
    if (!parsed.success) {
      logger.warn('웹훅 payload 검증 실패', { body: request.body })
      return reply.code(400).send({ error: 'productOrderId 필드가 필요합니다.' })
    }
    const { productOrderId: naverOrderId } = parsed.data

    try {
      await orderQueue.add('process-order', {
        naverOrderId,
        trigger: 'webhook',
      } as OrderJobData)

      logger.info('웹훅 주문 큐 추가 완료', { naverOrderId })
      return reply.code(200).send({ ok: true, naverOrderId })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('웹훅 주문 큐 추가 실패', { naverOrderId, error: message })
      return reply.code(500).send({ error: '내부 서버 오류' })
    }
  })
}
