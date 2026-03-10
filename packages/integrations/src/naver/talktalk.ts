import { BaseApiClient, type ApiResponse } from '../base'

interface TalkTalkMessage {
  messageId: string
  channelId: string
  storeId: string
  customerId: string
  customerName: string
  message: string
  messageType: 'TEXT' | 'IMAGE' | 'FILE'
  timestamp: Date
  isRead: boolean
}

interface TalkTalkCustomer {
  customerId: string
  name: string
  phone?: string
  email?: string
  lastMessageTime: Date
  unreadCount: number
}

interface SendMessageRequest {
  channelId: string
  customerId: string
  message: string
  messageType?: 'TEXT' | 'IMAGE' | 'FILE'
  attachments?: Array<{
    url: string
    name: string
    size: number
  }>
}

interface AutoReplyTemplate {
  templateId: string
  name: string
  trigger: string
  message: string
  keywords: string[]
  priority: number
  enabled: boolean
}

interface TalkTalkWebhookPayload {
  eventType: 'MESSAGE_RECEIVED' | 'MESSAGE_READ' | 'CUSTOMER_JOINED'
  storeId: string
  channelId: string
  customerId: string
  message?: string
  timestamp: Date
}

export class TalkTalkClient extends BaseApiClient {
  private baseUrl = 'https://talk-api.naver.com/v1'

  constructor(config: {
    clientId: string
    clientSecret: string
    storeId: string
  }) {
    super()
    this.setHeader('X-Client-Id', config.clientId)
    this.setHeader('X-Client-Secret', config.clientSecret)
    this.setHeader('X-Store-Id', config.storeId)
  }

  /**
   * 고객 메시지 목록 조회
   */
  async getMessages(params: {
    customerId?: string
    channelId?: string
    startDate?: Date
    endDate?: Date
    limit?: number
    offset?: number
  }): Promise<ApiResponse<TalkTalkMessage[]>> {
    const queryParams = new URLSearchParams()

    if (params.customerId) queryParams.append('customerId', params.customerId)
    if (params.channelId) queryParams.append('channelId', params.channelId)
    if (params.startDate) queryParams.append('startDate', params.startDate.toISOString())
    if (params.endDate) queryParams.append('endDate', params.endDate.toISOString())
    if (params.limit) queryParams.append('limit', params.limit.toString())
    if (params.offset) queryParams.append('offset', params.offset.toString())

    return this.request<TalkTalkMessage[]>({
      method: 'GET',
      url: `${this.baseUrl}/messages?${queryParams.toString()}`
    })
  }

  /**
   * 고객 목록 조회
   */
  async getCustomers(params: {
    channelId?: string
    hasUnread?: boolean
    limit?: number
    offset?: number
  }): Promise<ApiResponse<TalkTalkCustomer[]>> {
    const queryParams = new URLSearchParams()

    if (params.channelId) queryParams.append('channelId', params.channelId)
    if (params.hasUnread !== undefined) queryParams.append('hasUnread', params.hasUnread.toString())
    if (params.limit) queryParams.append('limit', params.limit.toString())
    if (params.offset) queryParams.append('offset', params.offset.toString())

    return this.request<TalkTalkCustomer[]>({
      method: 'GET',
      url: `${this.baseUrl}/customers?${queryParams.toString()}`
    })
  }

  /**
   * 메시지 전송
   */
  async sendMessage(request: SendMessageRequest): Promise<ApiResponse<TalkTalkMessage>> {
    return this.request<TalkTalkMessage>({
      method: 'POST',
      url: `${this.baseUrl}/messages`,
      data: request
    })
  }

  /**
   * 자동 응답 템플릿 목록 조회
   */
  async getAutoReplyTemplates(): Promise<ApiResponse<AutoReplyTemplate[]>> {
    return this.request<AutoReplyTemplate[]>({
      method: 'GET',
      url: `${this.baseUrl}/templates/auto-reply`
    })
  }

  /**
   * 자동 응답 템플릿 생성
   */
  async createAutoReplyTemplate(template: Omit<AutoReplyTemplate, 'templateId'>): Promise<ApiResponse<AutoReplyTemplate>> {
    return this.request<AutoReplyTemplate>({
      method: 'POST',
      url: `${this.baseUrl}/templates/auto-reply`,
      data: template
    })
  }

  /**
   * 자동 응답 템플릿 업데이트
   */
  async updateAutoReplyTemplate(templateId: string, template: Partial<AutoReplyTemplate>): Promise<ApiResponse<AutoReplyTemplate>> {
    return this.request<AutoReplyTemplate>({
      method: 'PUT',
      url: `${this.baseUrl}/templates/auto-reply/${templateId}`,
      data: template
    })
  }

  /**
   * 메시지 읽음 처리
   */
  async markAsRead(messageIds: string[]): Promise<ApiResponse<void>> {
    return this.request<void>({
      method: 'POST',
      url: `${this.baseUrl}/messages/read`,
      data: { messageIds }
    })
  }

  /**
   * 웹훅 이벤트 처리
   */
  async handleWebhook(payload: TalkTalkWebhookPayload): Promise<{
    shouldAutoReply: boolean
    suggestedReply?: string
    matchedTemplate?: AutoReplyTemplate
  }> {
    // 자동 응답 템플릿 매칭 로직
    if (payload.eventType === 'MESSAGE_RECEIVED' && payload.message) {
      const templates = await this.getAutoReplyTemplates()

      if (templates.success && templates.data) {
        const enabledTemplates = templates.data
          .filter(t => t.enabled)
          .sort((a, b) => b.priority - a.priority)

        for (const template of enabledTemplates) {
          const messageText = payload.message.toLowerCase()
          const hasKeyword = template.keywords.some(keyword =>
            messageText.includes(keyword.toLowerCase())
          )

          if (hasKeyword || messageText.includes(template.trigger.toLowerCase())) {
            return {
              shouldAutoReply: true,
              suggestedReply: template.message,
              matchedTemplate: template
            }
          }
        }
      }
    }

    return { shouldAutoReply: false }
  }

  /**
   * 자동 응답 실행
   */
  async executeAutoReply(params: {
    channelId: string
    customerId: string
    templateId?: string
    customMessage?: string
  }): Promise<ApiResponse<TalkTalkMessage>> {
    let message: string

    if (params.customMessage) {
      message = params.customMessage
    } else if (params.templateId) {
      const templates = await this.getAutoReplyTemplates()
      const template = templates.data?.find(t => t.templateId === params.templateId)

      if (!template) {
        throw new Error(`Template ${params.templateId} not found`)
      }

      message = template.message
    } else {
      throw new Error('Either customMessage or templateId must be provided')
    }

    return this.sendMessage({
      channelId: params.channelId,
      customerId: params.customerId,
      message,
      messageType: 'TEXT'
    })
  }

  /**
   * 고객 문의 분석 (AI 기반)
   */
  async analyzeInquiry(message: string): Promise<{
    category: 'ORDER' | 'PRODUCT' | 'DELIVERY' | 'REFUND' | 'OTHER'
    sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE'
    urgency: 'HIGH' | 'MEDIUM' | 'LOW'
    suggestedActions: string[]
    entities: {
      orderNumber?: string
      productId?: string
      trackingNumber?: string
    }
  }> {
    // 간단한 키워드 기반 분석 (실제로는 AI/ML 모델 활용)
    const lowerMessage = message.toLowerCase()

    let category: 'ORDER' | 'PRODUCT' | 'DELIVERY' | 'REFUND' | 'OTHER' = 'OTHER'
    if (lowerMessage.includes('주문') || lowerMessage.includes('구매')) {
      category = 'ORDER'
    } else if (lowerMessage.includes('상품') || lowerMessage.includes('제품')) {
      category = 'PRODUCT'
    } else if (lowerMessage.includes('배송') || lowerMessage.includes('택배')) {
      category = 'DELIVERY'
    } else if (lowerMessage.includes('환불') || lowerMessage.includes('교환') || lowerMessage.includes('반품')) {
      category = 'REFUND'
    }

    let sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' = 'NEUTRAL'
    if (lowerMessage.includes('감사') || lowerMessage.includes('좋아') || lowerMessage.includes('만족')) {
      sentiment = 'POSITIVE'
    } else if (lowerMessage.includes('불만') || lowerMessage.includes('실망') || lowerMessage.includes('화나')) {
      sentiment = 'NEGATIVE'
    }

    let urgency: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM'
    if (lowerMessage.includes('급해') || lowerMessage.includes('빨리') || lowerMessage.includes('시급')) {
      urgency = 'HIGH'
    } else if (lowerMessage.includes('언제') || lowerMessage.includes('천천히')) {
      urgency = 'LOW'
    }

    const suggestedActions: string[] = []
    if (category === 'ORDER') suggestedActions.push('주문 상태 확인')
    if (category === 'DELIVERY') suggestedActions.push('배송 추적 정보 제공')
    if (category === 'REFUND') suggestedActions.push('환불/교환 정책 안내')
    if (sentiment === 'NEGATIVE') suggestedActions.push('고객 만족팀 에스컬레이션')

    // 주문번호, 상품ID 등 엔티티 추출 (정규식 기반)
    const entities: {
      orderNumber?: string
      productId?: string
      trackingNumber?: string
    } = {}
    const orderNumberMatch = message.match(/\d{8,12}/)
    if (orderNumberMatch) entities.orderNumber = orderNumberMatch[0]

    const productIdMatch = message.match(/P\d{6,10}/i)
    if (productIdMatch) entities.productId = productIdMatch[0]

    return {
      category,
      sentiment,
      urgency,
      suggestedActions,
      entities
    }
  }

  /**
   * 대화 이력 요약
   */
  async summarizeConversation(customerId: string, limit: number = 20): Promise<{
    totalMessages: number
    firstContactDate: Date
    lastContactDate: Date
    mainTopics: string[]
    resolvedIssues: number
    pendingIssues: number
  }> {
    const messages = await this.getMessages({ customerId, limit })

    if (!messages.success || !messages.data || messages.data.length === 0) {
      throw new Error('No messages found for customer')
    }

    const sortedMessages = messages.data.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )

    // 대화 분석 로직 (간단한 구현)
    const topics = new Set<string>()
    let resolvedCount = 0
    let pendingCount = 0

    for (const msg of messages.data) {
      const analysis = await this.analyzeInquiry(msg.message)
      topics.add(analysis.category)

      // 해결/미해결 판단 (간단한 휴리스틱)
      if (msg.message.includes('해결') || msg.message.includes('감사')) {
        resolvedCount++
      } else if (msg.message.includes('아직') || msg.message.includes('언제')) {
        pendingCount++
      }
    }

    return {
      totalMessages: messages.data.length,
      firstContactDate: new Date(sortedMessages[0].timestamp),
      lastContactDate: new Date(sortedMessages[sortedMessages.length - 1].timestamp),
      mainTopics: Array.from(topics),
      resolvedIssues: resolvedCount,
      pendingIssues: pendingCount
    }
  }
}

// Export types
export type {
  TalkTalkMessage,
  TalkTalkCustomer,
  SendMessageRequest,
  AutoReplyTemplate,
  TalkTalkWebhookPayload
}