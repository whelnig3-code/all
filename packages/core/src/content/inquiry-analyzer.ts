// =============================================
// LLM 기반 고객 문의 분석기
//
// 비유: 베테랑 상담원(LLM)이 고객 문의를 분류하고,
//       부재 시 매뉴얼(키워드 규칙)로 자동 분류하는 시스템
// =============================================

import { z } from 'zod'
import { createLogger } from '@smartstore/shared'

const logger = createLogger('inquiry-analyzer')

// =============================================
// 스키마 & 타입
// =============================================

/** LLM 응답 검증 스키마 */
const inquiryAnalysisSchema = z.object({
  category: z.enum(['ORDER', 'PRODUCT', 'DELIVERY', 'REFUND', 'OTHER']),
  sentiment: z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE']),
  urgency: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  suggestedActions: z.array(z.string()).default([]),
})

/** 문의 분석 결과 타입 */
export type InquiryAnalysis = z.infer<typeof inquiryAnalysisSchema> & {
  entities: {
    orderNumber?: string
    productId?: string
    trackingNumber?: string
  }
  method: 'llm' | 'keyword'
}

/** LLM 어댑터 인터페이스 (의존성 주입) */
export interface LlmAdapter {
  generate(params: {
    systemPrompt: string
    userPrompt: string
    temperature?: number
  }): Promise<{ content: string }>
}

// =============================================
// 프롬프트
// =============================================

const SYSTEM_PROMPT = `고객 문의 메시지를 분석하여 다음 JSON만 반환하세요. 설명 없이 JSON만 출력:
{
  "category": "ORDER" | "PRODUCT" | "DELIVERY" | "REFUND" | "OTHER",
  "sentiment": "POSITIVE" | "NEUTRAL" | "NEGATIVE",
  "urgency": "HIGH" | "MEDIUM" | "LOW",
  "suggestedActions": ["행동1", "행동2"]
}`

// =============================================
// 메인 함수
// =============================================

/**
 * LLM 기반 문의 분석 (실패 시 키워드 fallback)
 *
 * 비유: 베테랑 상담원(LLM)이 판단하고, 부재 시 매뉴얼(키워드)로 대응
 */
export async function analyzeInquiry(
  message: string,
  llmAdapter?: LlmAdapter,
): Promise<InquiryAnalysis> {
  const entities = extractEntities(message)

  // LLM 분석 시도
  if (llmAdapter) {
    try {
      const result = await llmAdapter.generate({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: message,
        temperature: 0.3,
      })

      const jsonMatch = result.content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = inquiryAnalysisSchema.safeParse(JSON.parse(jsonMatch[0]))
        if (parsed.success) {
          return { ...parsed.data, entities, method: 'llm' }
        }
      }
      logger.warn('LLM 응답 파싱 실패, 키워드 fallback', { content: result.content })
    } catch (error) {
      logger.warn('LLM 분석 실패, 키워드 fallback', { error: String(error) })
    }
  }

  // 키워드 기반 fallback
  return { ...analyzeByKeyword(message), entities, method: 'keyword' }
}

// =============================================
// 키워드 기반 분석
// =============================================

/** 키워드 매칭으로 문의를 분류하는 fallback 로직 */
function analyzeByKeyword(message: string) {
  const lower = message.toLowerCase()

  const category = classifyCategory(lower)
  const sentiment = classifySentiment(lower)
  const urgency = classifyUrgency(lower)
  const suggestedActions = buildSuggestedActions(category, sentiment)

  return { category, sentiment, urgency, suggestedActions }
}

/** 카테고리 분류 */
function classifyCategory(lower: string): InquiryAnalysis['category'] {
  if (lower.includes('주문') || lower.includes('구매')) return 'ORDER'
  if (lower.includes('상품') || lower.includes('제품')) return 'PRODUCT'
  if (lower.includes('배송') || lower.includes('택배')) return 'DELIVERY'
  if (lower.includes('환불') || lower.includes('교환') || lower.includes('반품')) return 'REFUND'
  return 'OTHER'
}

/** 감정 분류 */
function classifySentiment(lower: string): InquiryAnalysis['sentiment'] {
  if (lower.includes('감사') || lower.includes('좋아') || lower.includes('만족')) return 'POSITIVE'
  if (lower.includes('불만') || lower.includes('실망') || lower.includes('화나') || lower.includes('짜증')) return 'NEGATIVE'
  return 'NEUTRAL'
}

/** 긴급도 분류 */
function classifyUrgency(lower: string): InquiryAnalysis['urgency'] {
  if (lower.includes('급해') || lower.includes('빨리') || lower.includes('시급') || lower.includes('!!!')) return 'HIGH'
  if (lower.includes('천천히') || lower.includes('괜찮')) return 'LOW'
  return 'MEDIUM'
}

/** 카테고리/감정 기반 추천 행동 생성 */
function buildSuggestedActions(
  category: InquiryAnalysis['category'],
  sentiment: InquiryAnalysis['sentiment'],
): string[] {
  const actions: string[] = []
  if (category === 'ORDER') actions.push('주문 상태 확인')
  if (category === 'DELIVERY') actions.push('배송 추적 정보 제공')
  if (category === 'REFUND') actions.push('환불/교환 정책 안내')
  if (sentiment === 'NEGATIVE') actions.push('고객 만족팀 에스컬레이션')
  return actions
}

// =============================================
// 엔티티 추출
// =============================================

/** 정규식 기반 엔티티(주문번호, 상품ID, 송장번호) 추출 */
function extractEntities(message: string): InquiryAnalysis['entities'] {
  const entities: InquiryAnalysis['entities'] = {}

  const orderMatch = message.match(/\d{8,12}/)
  if (orderMatch) {
    entities.orderNumber = orderMatch[0]
  }

  const productMatch = message.match(/P\d{6,10}/i)
  if (productMatch) {
    entities.productId = productMatch[0]
  }

  const trackingMatch = message.match(/\d{10,14}/)
  if (trackingMatch && trackingMatch[0] !== entities.orderNumber) {
    entities.trackingNumber = trackingMatch[0]
  }

  return entities
}
