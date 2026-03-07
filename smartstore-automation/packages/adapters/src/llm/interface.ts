// =============================================
// LLM 어댑터 인터페이스
// - Ollama (무료, 기본), OpenAI (유료) 교체 가능
// - .env의 LLM_ADAPTER 값으로 런타임 전환
// =============================================

/** LLM 텍스트 생성 요청 */
export interface LLMGenerateInput {
  /** 시스템 프롬프트 (역할 지정) */
  systemPrompt: string
  /** 사용자 프롬프트 */
  userPrompt: string
  /** 최대 토큰 수 (기본 1000) */
  maxTokens?: number
  /** 창의성 0~1 (기본 0.7) */
  temperature?: number
}

/** LLM 텍스트 생성 결과 */
export interface LLMGenerateResult {
  /** 생성된 텍스트 */
  content: string
  /** 사용한 모델명 */
  model: string
  /** 사용 토큰 수 (없으면 null) */
  tokensUsed: number | null
}

/** 모든 LLM 어댑터가 구현해야 하는 인터페이스 */
export interface LLMAdapter {
  /** 텍스트 생성 */
  generate(input: LLMGenerateInput): Promise<LLMGenerateResult>
  /** 연결 테스트 */
  healthCheck(): Promise<boolean>
}
