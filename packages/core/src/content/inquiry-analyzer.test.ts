// =============================================
// LLM 기반 문의 분석기 단위 테스트
// =============================================

import {
  analyzeInquiry,
  type LlmAdapter,
  type InquiryAnalysis,
} from './inquiry-analyzer'

// @smartstore/shared mock
jest.mock('@smartstore/shared', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}))

// =============================================
// LLM 성공 시나리오
// =============================================

describe('analyzeInquiry — LLM 성공', () => {
  it('LLM 성공 시 카테고리, 감정, 긴급도가 포함된 분석 결과 반환', async () => {
    const mockAdapter: LlmAdapter = {
      generate: jest.fn().mockResolvedValue({
        content: JSON.stringify({
          category: 'DELIVERY',
          sentiment: 'NEGATIVE',
          urgency: 'HIGH',
          suggestedActions: ['배송 추적 정보 제공', '고객 만족팀 에스컬레이션'],
        }),
      }),
    }

    const result = await analyzeInquiry('배송이 너무 늦어요! 빨리 보내주세요', mockAdapter)

    expect(result.category).toBe('DELIVERY')
    expect(result.sentiment).toBe('NEGATIVE')
    expect(result.urgency).toBe('HIGH')
    expect(result.suggestedActions).toContain('배송 추적 정보 제공')
    expect(result.method).toBe('llm')
  })
})

// =============================================
// LLM 실패 → 키워드 fallback
// =============================================

describe('analyzeInquiry — LLM 실패 시 키워드 fallback', () => {
  it('LLM 에러 발생 시 키워드 기반 fallback 사용', async () => {
    const mockAdapter: LlmAdapter = {
      generate: jest.fn().mockRejectedValue(new Error('LLM 연결 실패')),
    }

    const result = await analyzeInquiry('환불 요청합니다', mockAdapter)

    expect(result.category).toBe('REFUND')
    expect(result.method).toBe('keyword')
    expect(result.suggestedActions).toContain('환불/교환 정책 안내')
  })

  it('LLM 응답이 잘못된 JSON일 때 fallback 사용', async () => {
    const mockAdapter: LlmAdapter = {
      generate: jest.fn().mockResolvedValue({
        content: '이것은 JSON이 아닙니다. 분석 결과를 알려드리겠습니다.',
      }),
    }

    const result = await analyzeInquiry('주문 상태 확인해주세요', mockAdapter)

    expect(result.category).toBe('ORDER')
    expect(result.method).toBe('keyword')
  })
})

// =============================================
// 엔티티 추출
// =============================================

describe('analyzeInquiry — 엔티티 추출', () => {
  it('주문번호 엔티티 추출', async () => {
    const result = await analyzeInquiry('주문번호 20240315001 상품 언제 오나요?')

    expect(result.entities.orderNumber).toBe('20240315001')
  })

  it('상품 ID 엔티티 추출', async () => {
    const result = await analyzeInquiry('P123456 상품 문의합니다')

    expect(result.entities.productId).toBe('P123456')
  })
})

// =============================================
// 빈 메시지
// =============================================

describe('analyzeInquiry — 빈 메시지', () => {
  it('빈 메시지 → 기본값 반환', async () => {
    const result = await analyzeInquiry('')

    expect(result.category).toBe('OTHER')
    expect(result.sentiment).toBe('NEUTRAL')
    expect(result.urgency).toBe('MEDIUM')
    expect(result.method).toBe('keyword')
    expect(result.entities).toBeDefined()
  })
})

// =============================================
// LLM 어댑터 없이 호출 (키워드만)
// =============================================

describe('analyzeInquiry — LLM 어댑터 없음', () => {
  it('어댑터 미제공 시 키워드 분석만 수행', async () => {
    const result = await analyzeInquiry('배송 추적번호 알려주세요')

    expect(result.category).toBe('DELIVERY')
    expect(result.method).toBe('keyword')
  })

  it('긍정 감정 키워드 인식', async () => {
    const result = await analyzeInquiry('감사합니다! 상품이 너무 좋아요')

    expect(result.sentiment).toBe('POSITIVE')
  })

  it('부정 감정 + 긴급도 높음 인식', async () => {
    const result = await analyzeInquiry('불만입니다! 빨리 처리해주세요!!!')

    expect(result.sentiment).toBe('NEGATIVE')
    expect(result.urgency).toBe('HIGH')
  })

  it('낮은 긴급도 인식', async () => {
    const result = await analyzeInquiry('천천히 확인해주셔도 괜찮아요')

    expect(result.urgency).toBe('LOW')
  })
})
