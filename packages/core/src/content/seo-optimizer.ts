// =============================================
// 네이버 SEO 최적화 (Phase C-2)
//
// 비유: 도서관에서 책을 찾으려면 제목이 정확해야 한다.
// "멋진 책" 보다 "파이썬 웹개발 입문서"가 찾기 쉽다.
// 상품명도 마찬가지 — 고객이 검색하는 키워드가 제목에 있어야 노출된다.
//
// 네이버 쇼핑 상품명 규칙:
//   - 100자 제한 (초과 시 노출 불이익)
//   - 과도한 특수문자/마케팅 문구 → 검색 패널티
//   - 핵심 키워드 + 스펙이 앞에 올수록 유리
// =============================================

/** 제거할 노이즈 패턴 */
const NOISE_PATTERNS = [
  /\[.*?무료.*?배송.*?\]/gi,
  /\[.*?배송.*?\]/gi,
  /【.*?】/g,
  /★.*?★/g,
  /\(.*?특가.*?\)/gi,
  /\(.*?할인.*?\)/gi,
  /최저가/gi,
  /특가/gi,
  /무료배송/gi,
  /당일배송/gi,
  /HOT/gi,
  /SALE/gi,
  /NEW/gi,
  /BEST/gi,
  /히트/gi,
  /인기/gi,
  /추천/gi,
  /!\s*/g,
  /\s{2,}/g, // 다중 공백
]

/**
 * 상품명 SEO 최적화
 *
 * 1. 노이즈 제거
 * 2. 핵심 키워드 + 스펙 유지
 * 3. 100자 제한 적용
 */
export function optimizeProductTitle(input: {
  readonly originalName: string
  readonly category?: string
}): string {
  const { originalName } = input
  if (!originalName.trim()) return ''

  let cleaned = originalName

  // 노이즈 제거
  for (const pattern of NOISE_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ')
  }

  // 양쪽 공백 + 다중 공백 정리
  cleaned = cleaned.replace(/\s+/g, ' ').trim()

  // 100자 제한
  if (cleaned.length > 100) {
    cleaned = cleaned.substring(0, 100).trim()
    // 마지막 단어가 잘렸으면 제거
    const lastSpace = cleaned.lastIndexOf(' ')
    if (lastSpace > 80) {
      cleaned = cleaned.substring(0, lastSpace)
    }
  }

  return cleaned
}

/**
 * 검색 태그 생성
 *
 * 상품명에서 2글자 이상 키워드를 추출, 최대 10개
 */
export function generateSearchTags(productName: string): string[] {
  if (!productName.trim()) return []

  // 노이즈 제거
  let cleaned = productName
  for (const pattern of NOISE_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ')
  }

  // 단어 분리 + 필터링
  const words = cleaned
    .split(/[\s\/\-\+,]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1) // 1글자 제외
    .filter((w) => !/^[\d.]+$/.test(w)) // 순수 숫자 제외

  // 중복 제거 + 최대 10개
  const unique = [...new Set(words)]
  return unique.slice(0, 10)
}
