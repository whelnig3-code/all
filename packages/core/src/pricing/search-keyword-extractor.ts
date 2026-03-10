// =============================================
// 검색 키워드 추출기
// - 도매꾹 상품명에서 핵심 검색어 추출
// - 노이즈 제거 + 스펙 보존
// =============================================

/** 제거할 노이즈 패턴 */
const NOISE_PATTERNS = [
  /\[.*?\]/g,                          // [무료배송], [당일발송]
  /\(.*?\)/g,                          // (색상선택), (국내배송)
  /【.*?】/g,                           // 【특가】
  /무료배송|당일[발배]송|국내배송|빠른배송/g,
  /특가|초특가|대박|인기|추천|베스트|BEST|HOT|SALE|NEW|히트/gi,
  /할인|세일|이벤트|감사|사은품|증정|덤/g,
  /최저가|파격|행사|1\+1|2\+1|반값/g,
  /KC인증|안전인증|정품|국내정발/g,
  /모음전|모음|골라담기/g,
  /\d+P단위|단위\s*주문/g,
]

/** 스펙 패턴 (검색에 유용한 것만) */
const SEARCH_SPEC_PATTERNS = [
  { regex: /(\d+(?:\.\d+)?\s*[Vv])\b/, priority: 1 },        // 전압: 18V, 20V
  { regex: /(\d+(?:\.\d+)?\s*[Ww])\b/, priority: 2 },        // 출력: 100W
  { regex: /(\d+(?:,?\d+)?\s*m[Aa][Hh])/, priority: 3 },     // 용량: 10000mAh
  { regex: /(\d+(?:\.\d+)?\s*(?:mm|cm))\b/, priority: 4 },   // 사이즈: 25mm
  { regex: /(\d+(?:\.\d+)?\s*(?:ml|ML|L|리터))/, priority: 5 }, // 용량: 500ml
]

/**
 * 도매꾹 상품명에서 네이버 쇼핑 검색용 핵심 키워드 추출
 *
 * "토크렌치 다기능렌치 볼트 너트 풀기 육각렌치 공구" → "토크렌치 다기능렌치"
 * "[무료배송] 스테인리스 텀블러 500ml 보온보냉" → "스테인리스 텀블러 500ml"
 *
 * @param fullName 도매꾹 상품명 (전체)
 * @param maxLength 최대 길이 (기본 30자)
 */
export function extractSearchKeyword(fullName: string, maxLength = 30): string {
  if (!fullName) return ''

  // HTML 태그 제거
  let cleaned = fullName.replace(/<[^>]+>/g, '').trim()

  // 노이즈 패턴 제거
  for (const pattern of NOISE_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ')
  }

  // 연속 공백 정리
  cleaned = cleaned.replace(/\s+/g, ' ').trim()

  if (!cleaned) return fullName.replace(/<[^>]+>/g, '').trim().substring(0, maxLength)

  // 스펙 추출 (원본에서)
  const specs: string[] = []
  for (const { regex } of SEARCH_SPEC_PATTERNS) {
    const match = fullName.match(regex)
    if (match) specs.push(match[1].trim())
  }

  // 단어 분리 후 핵심 키워드 선택
  const words = cleaned.split(/\s+/).filter((w) => w.length >= 2)
  if (words.length === 0) return cleaned.substring(0, maxLength)

  // 첫 2~3 단어를 핵심 제품명으로
  const coreWords: string[] = []
  let coreLen = 0

  for (const word of words) {
    // 스펙은 별도로 추가하므로 중복 방지
    if (specs.some((s) => word.includes(s) || s.includes(word))) continue

    // 너무 일반적인 단어 스킵
    if (/^(및|등|용|형|식|총|약|각|외|더|슈퍼|프리미엄|고급|럭셔리)$/.test(word)) continue

    coreWords.push(word)
    coreLen += word.length + 1
    if (coreWords.length >= 3 || coreLen >= 18) break
  }

  // 핵심 키워드 + 스펙 조합
  const parts = [...coreWords, ...specs.slice(0, 2)]
  let result = parts.join(' ')

  // 최대 길이 제한
  if (result.length > maxLength) {
    result = result.substring(0, maxLength).trim()
  }

  return result || cleaned.substring(0, maxLength)
}
