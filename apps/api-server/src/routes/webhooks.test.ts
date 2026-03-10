// =============================================
// 네이버 웹훅 서명 검증 테스트
// =============================================

import Fastify from 'fastify'
import * as crypto from 'crypto'
import { webhooksRouter } from './webhooks'

// Mock dependencies
jest.mock('@smartstore/shared', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
  config: {
    naver: { clientSecret: 'test-secret-key' },
  },
}))

const mockQueueAdd = jest.fn().mockResolvedValue({})
const mockTalkTalkQueueAdd = jest.fn().mockResolvedValue({})
jest.mock('../queues', () => ({
  orderQueue: { add: (...args: unknown[]) => mockQueueAdd(...args) },
  talkTalkQueue: { add: (...args: unknown[]) => mockTalkTalkQueueAdd(...args) },
}))

/** HMAC-SHA256 서명 생성 헬퍼 */
function generateSignature(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('base64')
}

describe('POST /webhooks/naver — 서명 검증', () => {
  const SECRET = 'test-secret-key'

  async function buildApp() {
    const app = Fastify()
    // rawBody 접근을 위해 content type parser 추가
    app.addContentTypeParser(
      'application/json',
      { parseAs: 'string' },
      (req, body, done) => {
        try {
          ;(req as any).rawBody = body
          done(null, JSON.parse(body as string))
        } catch (err) {
          done(err as Error, undefined)
        }
      },
    )
    await app.register(webhooksRouter)
    return app
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('유효한 서명 → 200 OK, 큐에 추가됨', async () => {
    const app = await buildApp()
    const payload = JSON.stringify({ productOrderId: 'order-001' })
    const signature = generateSignature(payload, SECRET)

    const res = await app.inject({
      method: 'POST',
      url: '/naver',
      headers: {
        'content-type': 'application/json',
        'x-naver-signature': signature,
      },
      payload,
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ ok: true, naverOrderId: 'order-001' })
    expect(mockQueueAdd).toHaveBeenCalledTimes(1)
  })

  it('서명 누락 → 401 Unauthorized', async () => {
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: '/naver',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ productOrderId: 'order-002' }),
    })

    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error).toContain('서명')
    expect(mockQueueAdd).not.toHaveBeenCalled()
  })

  it('잘못된 서명 → 401 Unauthorized', async () => {
    const app = await buildApp()
    const payload = JSON.stringify({ productOrderId: 'order-003' })
    const fakeSignature = generateSignature(payload, 'wrong-secret')

    const res = await app.inject({
      method: 'POST',
      url: '/naver',
      headers: {
        'content-type': 'application/json',
        'x-naver-signature': fakeSignature,
      },
      payload,
    })

    expect(res.statusCode).toBe(401)
    expect(mockQueueAdd).not.toHaveBeenCalled()
  })

  it('productOrderId 누락 → 400 Bad Request', async () => {
    const app = await buildApp()
    const payload = JSON.stringify({ someField: 'value' })
    const signature = generateSignature(payload, SECRET)

    const res = await app.inject({
      method: 'POST',
      url: '/naver',
      headers: {
        'content-type': 'application/json',
        'x-naver-signature': signature,
      },
      payload,
    })

    expect(res.statusCode).toBe(400)
  })

  it('유효한 서명 + 정상 payload → 큐에 정확한 데이터 전달', async () => {
    const app = await buildApp()
    const payload = JSON.stringify({ productOrderId: 'order-005' })
    const signature = generateSignature(payload, SECRET)

    await app.inject({
      method: 'POST',
      url: '/naver',
      headers: {
        'content-type': 'application/json',
        'x-naver-signature': signature,
      },
      payload,
    })

    expect(mockQueueAdd).toHaveBeenCalledWith(
      'process-order',
      expect.objectContaining({
        naverOrderId: 'order-005',
        trigger: 'webhook',
      }),
    )
  })
})

// =============================================
// 톡톡 웹훅 테스트
// =============================================

describe('POST /webhooks/talktalk — 톡톡 메시지 웹훅', () => {
  async function buildApp() {
    const app = Fastify()
    await app.register(webhooksRouter)
    return app
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  const validPayload = {
    eventType: 'MESSAGE_RECEIVED',
    storeId: 'store-001',
    channelId: 'ch-001',
    customerId: 'cust-001',
    message: '주문한 상품이 언제 배송되나요?',
    messageType: 'TEXT',
  }

  it('유효한 MESSAGE_RECEIVED → 200 + 큐에 추가', async () => {
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: '/talktalk',
      payload: validPayload,
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ ok: true })
    expect(mockTalkTalkQueueAdd).toHaveBeenCalledTimes(1)
    expect(mockTalkTalkQueueAdd).toHaveBeenCalledWith(
      'process-message',
      expect.objectContaining({
        channelId: 'ch-001',
        customerId: 'cust-001',
        message: '주문한 상품이 언제 배송되나요?',
        messageType: 'TEXT',
      }),
    )
  })

  it('잘못된 payload → 400', async () => {
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: '/talktalk',
      payload: { invalidField: 'value' },
    })

    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toContain('유효하지 않은')
    expect(mockTalkTalkQueueAdd).not.toHaveBeenCalled()
  })

  it('MESSAGE_READ 이벤트 → 200 (무시, 큐 추가 안함)', async () => {
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: '/talktalk',
      payload: {
        ...validPayload,
        eventType: 'MESSAGE_READ',
      },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ ok: true })
    expect(mockTalkTalkQueueAdd).not.toHaveBeenCalled()
  })

  it('message 없는 MESSAGE_RECEIVED → 200 (무시, 큐 추가 안함)', async () => {
    const app = await buildApp()
    const { message: _, ...noMessage } = validPayload

    const res = await app.inject({
      method: 'POST',
      url: '/talktalk',
      payload: noMessage,
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ ok: true })
    expect(mockTalkTalkQueueAdd).not.toHaveBeenCalled()
  })
})
