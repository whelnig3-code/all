// =============================================
// 금칙어/리스크 표현 필터 모듈
// - 네이버 정책 위반 표현 제거·치환
// - 최대 3개 불릿, 18자 이내
// =============================================

import { createLogger } from '@smartstore/shared'

const logger = createLogger('policy-filter')

/** 기본 불릿 포인트 (번역/필터 후 빈 결과 시 사용) */
const DEFAULT_BULLETS = [
  '가정용 DIY 작업에 적합',
  '사용이 간편한 구성',
  '보관/정리에 편리',
]

/** 치환 규칙: [정규식, 대체 문자열] */
const REPLACEMENT_RULES: [RegExp, string][] = [
  [/최고/g, '실용적'],
  [/100\s*%/g, ''],
]

/** 삭제 규칙: 해당 단어 포함 시 해당 불릿 전체 제거 또는 단어 삭제 */
const DELETE_WORDS = [
  '절대',
  '완전',
  '무조건',
  '보장',
  '의료',
  '치료',
  '완전방수',
  'KC인증 보장',
  '정품 보장',
]

/** 삭제 키워드 정규식 (한 번만 컴파일) */
const DELETE_PATTERN = new RegExp(
  DELETE_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'g'
)

/**
 * 단일 텍스트에 치환 규칙 적용
 */
function applyReplacements(text: string): string {
  let result = text
  for (const [pattern, replacement] of REPLACEMENT_RULES) {
    result = result.replace(pattern, replacement)
  }
  // 삭제 키워드 제거
  result = result.replace(DELETE_PATTERN, '')
  // 연속 공백 정리
  return result.replace(/\s+/g, ' ').trim()
}

/**
 * 텍스트 18자 이내로 자르기 (단어 단위 존중)
 */
function truncateTo18Chars(text: string): string {
  if (text.length <= 18) return text
  return text.substring(0, 18).trimEnd()
}

/**
 * 금칙어/과장 표현 제거·치환 후 불릿 포인트 반환
 * @param koTexts 한국어 텍스트 배열
 * @returns 필터링된 불릿 최대 3개 (빈 결과 시 기본 불릿)
 */
export function sanitizeMarketingPhrases(koTexts: string[]): string[] {
  // 각 텍스트에 필터 적용
  const filtered = koTexts
    .map(applyReplacements)
    .filter((text) => text.length > 0) // 빈 텍스트 제거

  // 18자 이내로 자르기
  const truncated = filtered.map(truncateTo18Chars).filter((t) => t.length > 0)

  // 중복 제거
  const unique = [...new Set(truncated)]

  // 결과가 없으면 기본 불릿 사용
  if (unique.length === 0) {
    logger.info('policy_filter: 빈 결과 — 기본 불릿 사용')
    return DEFAULT_BULLETS
  }

  // 최대 3개 반환
  const result = unique.slice(0, 3)
  logger.info('policy_filter_complete', { input: koTexts.length, output: result.length })
  return result
}
