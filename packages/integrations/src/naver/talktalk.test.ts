// =============================================
// TalkTalk 클라이언트 단위 테스트
// - 문의 분석 (카테고리/감성/긴급도)
// - 웹훅 처리 및 자동 응답
// - 메시지 전송
// =============================================

// axios mock: BaseApiClient가 axios.create()를 호출
const mockRequest = jest.fn()

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({
      request: mockRequest,
      defaults: {
        headers: { common: {} },
      },
    })),
  },
}))

// @smartstore/shared mock (필요시)
jest.mock('@smartstore/shared', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}))

import { TalkTalkClient } from './talktalk'

// =============================================
// 헬퍼
// =============================================

function createClient(): TalkTalkClient {
  return new TalkTalkClient({
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    storeId: 'test-store-id',
  })
}

/** 자동 응답 템플릿 mock 데이터 */
function mockTemplatesResponse(templates: Array<{
  templateId: string
  name: string
  trigger: string
  message: string
  keywords: string[]
  priority: number
  enabled: boolean
}>) {
  mockRequest.mockResolvedValueOnce({
    data: templates,
  })
}

// =============================================
// 테스트
// =============================================

describe('TalkTalkClient', () => {
  let client: TalkTalkClient

  beforeEach(() => {
    jest.clearAllMocks()
    client = createClient()
  })

  // ----- analyzeInquiry: 카테고리 -----

  describe('analyzeInquiry - category', () => {
    it('주문/구매 키워드 → ORDER', async () => {
      const result = await client.analyzeInquiry('주문 상태를 확인하고 싶어요')
      expect(result.category).toBe('ORDER')
    })

    it('배송/택배 키워드 → DELIVERY', async () => {
      const result = await client.analyzeInquiry('택배가 아직 안 왔어요')
      expect(result.category).toBe('DELIVERY')
    })

    it('환불/교환/반품 키워드 → REFUND', async () => {
      const result = await client.analyzeInquiry('환불 받고 싶습니다')
      expect(result.category).toBe('REFUND')
    })

    it('매칭 없으면 → OTHER', async () => {
      const result = await client.analyzeInquiry('안녕하세요')
      expect(result.category).toBe('OTHER')
    })
  })

  // ----- analyzeInquiry: 감성 -----

  describe('analyzeInquiry - sentiment', () => {
    it('감사/좋아/만족 → POSITIVE', async () => {
      const result = await client.analyzeInquiry('정말 감사합니다')
      expect(result.sentiment).toBe('POSITIVE')
    })

    it('불만/실망/화나 → NEGATIVE', async () => {
      const result = await client.analyzeInquiry('서비스에 불만이 있습니다')
      expect(result.sentiment).toBe('NEGATIVE')
    })

    it('매칭 없으면 → NEUTRAL', async () => {
      const result = await client.analyzeInquiry('안녕하세요')
      expect(result.sentiment).toBe('NEUTRAL')
    })
  })

  // ----- analyzeInquiry: 긴급도 -----

  describe('analyzeInquiry - urgency', () => {
    it('급해/빨리/시급 → HIGH', async () => {
      const result = await client.analyzeInquiry('빨리 처리해주세요')
      expect(result.urgency).toBe('HIGH')
    })

    it('언제/천천히 → LOW', async () => {
      const result = await client.analyzeInquiry('천천히 확인해주세요')
      expect(result.urgency).toBe('LOW')
    })

    it('매칭 없으면 → MEDIUM', async () => {
      const result = await client.analyzeInquiry('안녕하세요')
      expect(result.urgency).toBe('MEDIUM')
    })
  })

  // ----- analyzeInquiry: 엔티티 추출 -----

  describe('analyzeInquiry - entity extraction', () => {
    it('주문번호를 추출한다', async () => {
      const result = await client.analyzeInquiry('주문번호 12345678 확인 부탁드립니다')
      expect(result.entities.orderNumber).toBe('12345678')
    })

    it('상품 ID를 추출한다', async () => {
      const result = await client.analyzeInquiry('상품 P123456 문의드립니다')
      expect(result.entities.productId).toBe('P123456')
    })
  })

  // ----- analyzeInquiry: 기본값 조합 -----

  describe('analyzeInquiry - defaults', () => {
    it('키워드 없으면 OTHER/NEUTRAL/MEDIUM', async () => {
      const result = await client.analyzeInquiry('안녕하세요')
      expect(result.category).toBe('OTHER')
      expect(result.sentiment).toBe('NEUTRAL')
      expect(result.urgency).toBe('MEDIUM')
    })
  })

  // ----- handleWebhook -----

  describe('handleWebhook', () => {
    it('키워드 매칭되는 템플릿이 있으면 shouldAutoReply true', async () => {
      mockTemplatesResponse([
        {
          templateId: 'tpl-1',
          name: '배송 안내',
          trigger: '배송',
          message: '배송은 보통 2-3일 소요됩니다.',
          keywords: ['배송', '택배', '언제'],
          priority: 10,
          enabled: true,
        },
      ])

      const result = await client.handleWebhook({
        eventType: 'MESSAGE_RECEIVED',
        storeId: 'store-1',
        channelId: 'ch-1',
        customerId: 'cust-1',
        message: '배송 언제 오나요?',
        timestamp: new Date(),
      })

      expect(result.shouldAutoReply).toBe(true)
      expect(result.suggestedReply).toBe('배송은 보통 2-3일 소요됩니다.')
      expect(result.matchedTemplate?.templateId).toBe('tpl-1')
    })

    it('매칭되는 템플릿이 없으면 shouldAutoReply false', async () => {
      mockTemplatesResponse([
        {
          templateId: 'tpl-1',
          name: '배송 안내',
          trigger: '배송',
          message: '배송은 보통 2-3일 소요됩니다.',
          keywords: ['배송', '택배'],
          priority: 10,
          enabled: true,
        },
      ])

      const result = await client.handleWebhook({
        eventType: 'MESSAGE_RECEIVED',
        storeId: 'store-1',
        channelId: 'ch-1',
        customerId: 'cust-1',
        message: '안녕하세요 문의드립니다',
        timestamp: new Date(),
      })

      expect(result.shouldAutoReply).toBe(false)
      expect(result.suggestedReply).toBeUndefined()
    })

    it('MESSAGE_RECEIVED가 아닌 이벤트는 shouldAutoReply false', async () => {
      const result = await client.handleWebhook({
        eventType: 'MESSAGE_READ',
        storeId: 'store-1',
        channelId: 'ch-1',
        customerId: 'cust-1',
        timestamp: new Date(),
      })

      expect(result.shouldAutoReply).toBe(false)
    })
  })

  // ----- executeAutoReply -----

  describe('executeAutoReply', () => {
    it('customMessage가 있으면 해당 메시지를 전송한다', async () => {
      mockRequest.mockResolvedValueOnce({
        data: {
          messageId: 'msg-1',
          channelId: 'ch-1',
          storeId: 'store-1',
          customerId: 'cust-1',
          customerName: '홍길동',
          message: '커스텀 메시지입니다',
          messageType: 'TEXT',
          timestamp: new Date(),
          isRead: false,
        },
      })

      const result = await client.executeAutoReply({
        channelId: 'ch-1',
        customerId: 'cust-1',
        customMessage: '커스텀 메시지입니다',
      })

      expect(result.success).toBe(true)
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          data: expect.objectContaining({
            message: '커스텀 메시지입니다',
            messageType: 'TEXT',
          }),
        })
      )
    })

    it('templateId가 있으면 해당 템플릿 메시지를 전송한다', async () => {
      // 첫 번째 호출: getAutoReplyTemplates
      mockTemplatesResponse([
        {
          templateId: 'tpl-1',
          name: '배송 안내',
          trigger: '배송',
          message: '배송은 2-3일 소요됩니다.',
          keywords: ['배송'],
          priority: 10,
          enabled: true,
        },
      ])

      // 두 번째 호출: sendMessage
      mockRequest.mockResolvedValueOnce({
        data: {
          messageId: 'msg-2',
          channelId: 'ch-1',
          storeId: 'store-1',
          customerId: 'cust-1',
          customerName: '홍길동',
          message: '배송은 2-3일 소요됩니다.',
          messageType: 'TEXT',
          timestamp: new Date(),
          isRead: false,
        },
      })

      const result = await client.executeAutoReply({
        channelId: 'ch-1',
        customerId: 'cust-1',
        templateId: 'tpl-1',
      })

      expect(result.success).toBe(true)
      // getAutoReplyTemplates + sendMessage = 2 calls
      expect(mockRequest).toHaveBeenCalledTimes(2)
    })

    it('templateId가 없는 템플릿이면 에러를 throw한다', async () => {
      mockTemplatesResponse([])

      await expect(
        client.executeAutoReply({
          channelId: 'ch-1',
          customerId: 'cust-1',
          templateId: 'non-existent',
        })
      ).rejects.toThrow('Template non-existent not found')
    })
  })
})
