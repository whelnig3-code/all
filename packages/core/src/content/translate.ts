// =============================================
// 텍스트 번역 모듈 (Ollama 로컬 LLM)
// - Ollama HTTP API로 한국어 번역
// - 실패 시 원문 유지 (등록 중단 금지)
// =============================================

import axios from 'axios'
import { createLogger } from '@smartstore/shared'

const logger = createLogger('translate')

/** Ollama API 응답 타입 */
interface OllamaResponse {
  response: string
  done: boolean
}

/** Ollama 설정 (환경변수 우선) */
function getOllamaConfig() {
  return {
    baseUrl: process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434',
    model: process.env['TRANSLATION_MODEL'] ?? 'qwen2.5:7b-instruct',
  }
}

/**
 * 특수문자만으로 구성된 텍스트인지 확인
 */
function isSpecialCharsOnly(text: string): boolean {
  return /^[^\p{L}\p{N}]+$/u.test(text)
}

/**
 * 번역이 불필요한 텍스트 필터링
 * - 길이 2 미만
 * - 특수문자만으로 구성
 */
function shouldSkipTranslation(text: string): boolean {
  return text.trim().length < 2 || isSpecialCharsOnly(text.trim())
}

/**
 * 단일 텍스트를 한국어로 번역
 * 실패 시 원문 반환
 */
async function translateSingle(
  text: string,
  baseUrl: string,
  model: string
): Promise<string> {
  const prompt = `다음 텍스트를 한국어로 번역해주세요. 번역문만 출력하세요:\n${text}`

  try {
    const response = await axios.post<OllamaResponse>(
      `${baseUrl}/api/generate`,
      {
        model,
        prompt,
        stream: false,
        options: {
          temperature: 0.1, // 번역 일관성을 위해 낮은 temperature
          num_predict: 100,
        },
      },
      { timeout: 30000 }
    )

    const translated = response.data.response.trim()
    return translated || text // 빈 결과면 원문 유지
  } catch (error) {
    // 네트워크 오류 등 — 원문 반환
    const message = error instanceof Error ? error.message : String(error)
    logger.warn('translate_failed', { text: text.substring(0, 50), reason: message })
    return text
  }
}

/**
 * 텍스트 배열을 한국어로 번역
 * @param texts 번역할 텍스트 배열
 * @returns 번역된 텍스트 배열 (실패 시 원문 유지)
 */
export async function translateToKorean(texts: string[]): Promise<string[]> {
  if (texts.length === 0) return []

  const { baseUrl, model } = getOllamaConfig()

  // 번역 가능한 텍스트만 필터링 (건너뛸 텍스트는 원문 유지)
  const results = await Promise.all(
    texts.map(async (text) => {
      if (shouldSkipTranslation(text)) {
        logger.debug('번역 건너뜀 (길이 부족 또는 특수문자만)', { text })
        return text
      }
      return translateSingle(text, baseUrl, model)
    })
  )

  logger.info('translate_complete', { count: results.length })
  return results
}
