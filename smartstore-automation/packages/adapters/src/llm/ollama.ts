// =============================================
// Ollama LLM 어댑터 (무료, 로컬 실행)
//
// 실행 전제: ollama serve 로컬 실행 중
// 기본 모델: llama3.2 또는 mistral-nemo (한국어 성능 양호)
// =============================================

import { createLogger } from '@smartstore/shared'
import type { LLMAdapter, LLMGenerateInput, LLMGenerateResult } from './interface'

const logger = createLogger('ollama-adapter')

interface OllamaGenerateRequest {
  model: string
  prompt: string
  system?: string
  options?: {
    temperature?: number
    num_predict?: number
  }
  stream: false
}

interface OllamaGenerateResponse {
  model: string
  response: string
  eval_count?: number
  done: boolean
}

export class OllamaAdapter implements LLMAdapter {
  private readonly baseUrl: string
  private readonly model: string

  constructor(baseUrl: string, model: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.model = model
  }

  async generate(input: LLMGenerateInput): Promise<LLMGenerateResult> {
    const { systemPrompt, userPrompt, maxTokens = 1000, temperature = 0.7 } = input

    const body: OllamaGenerateRequest = {
      model: this.model,
      prompt: userPrompt,
      system: systemPrompt,
      options: {
        temperature,
        num_predict: maxTokens,
      },
      stream: false,
    }

    logger.debug('Ollama 텍스트 생성 요청', {
      model: this.model,
      promptLength: userPrompt.length,
    })

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Ollama API 오류 [${response.status}]: ${text}`)
    }

    const data = (await response.json()) as OllamaGenerateResponse

    return {
      content: data.response,
      model: data.model,
      tokensUsed: data.eval_count ?? null,
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      })
      return response.ok
    } catch {
      logger.warn('Ollama 헬스체크 실패 — 로컬 서버 실행 여부 확인 필요')
      return false
    }
  }
}
