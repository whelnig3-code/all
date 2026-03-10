// =============================================
// OpenAI LLM 어댑터 (유료)
//
// .env: LLM_ADAPTER=openai, OPENAI_API_KEY=sk-...
// 기본 모델: gpt-4o-mini (비용 절감)
// =============================================

import { createLogger } from '@smartstore/shared'
import type { LLMAdapter, LLMGenerateInput, LLMGenerateResult } from './interface'

const logger = createLogger('openai-adapter')

interface OpenAIChatRequest {
  model: string
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  max_tokens: number
  temperature: number
}

interface OpenAIChatResponse {
  model: string
  choices: Array<{ message: { content: string } }>
  usage?: { total_tokens: number }
}

export class OpenAIAdapter implements LLMAdapter {
  private readonly apiKey: string
  private readonly model: string

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey
    this.model = model
  }

  async generate(input: LLMGenerateInput): Promise<LLMGenerateResult> {
    const { systemPrompt, userPrompt, maxTokens = 1000, temperature = 0.7 } = input

    const body: OpenAIChatRequest = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature,
    }

    logger.debug('OpenAI 텍스트 생성 요청', { model: this.model })

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`OpenAI API 오류 [${response.status}]: ${text}`)
    }

    const data = (await response.json()) as OpenAIChatResponse

    return {
      content: data.choices[0].message.content,
      model: data.model,
      tokensUsed: data.usage?.total_tokens ?? null,
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(5000),
      })
      return response.ok
    } catch {
      logger.warn('OpenAI 헬스체크 실패')
      return false
    }
  }
}
