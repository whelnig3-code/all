// =============================================
// LLM 어댑터 팩토리
// - LLM_ADAPTER=ollama → OllamaAdapter (기본)
// - LLM_ADAPTER=openai → OpenAIAdapter (유료)
// =============================================

import { config, createLogger } from '@smartstore/shared'
import { OllamaAdapter } from './ollama'
import { OpenAIAdapter } from './openai'
import type { LLMAdapter } from './interface'

const logger = createLogger('llm-factory')

function createLLMAdapter(): LLMAdapter {
  const adapterType = config.llm?.adapter ?? 'ollama'

  switch (adapterType) {
    case 'openai': {
      const apiKey = config.llm?.openaiApiKey
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY 환경변수가 설정되지 않았습니다')
      }
      const model = config.llm?.openaiModel ?? 'gpt-4o-mini'
      logger.info(`LLM 어댑터: OpenAI (${model})`)
      return new OpenAIAdapter(apiKey, model)
    }

    case 'ollama':
    default: {
      const baseUrl = config.llm?.ollamaBaseUrl ?? 'http://localhost:11434'
      const model = config.llm?.ollamaModel ?? 'llama3.2'
      logger.info(`LLM 어댑터: Ollama (${model} @ ${baseUrl})`)
      return new OllamaAdapter(baseUrl, model)
    }
  }
}

/** 싱글톤 LLM 어댑터 인스턴스 */
export const llmAdapter: LLMAdapter = createLLMAdapter()
