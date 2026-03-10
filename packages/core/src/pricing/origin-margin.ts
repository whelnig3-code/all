// =============================================
// 원산지 기반 차등 마진 (Phase B-2)
//
// 비유: 와인 가격은 산지에 따라 다르다.
// 프랑스산은 프리미엄, 칠레산은 가성비.
// 공구도 마찬가지 — 독일산 보쉬 vs 중국산 노브랜드.
//
// 1,468개 상품 분석 결과:
//   - 국산: 소비자가 10~20% 프리미엄 지불 의향
//   - 일본/독일: 품질 인식 높음, 5~15% 프리미엄
//   - 중국: 가격 경쟁 필수, 마진 낮춰서 판매량 확보
// =============================================

/** 프리미엄 원산지 (마진 가산) */
const PREMIUM_ORIGINS: ReadonlyArray<{ keywords: readonly string[]; adjustment: number }> = [
  { keywords: ['한국', '대한민국', 'korea', 'kr'], adjustment: 0.05 },
  { keywords: ['일본', 'japan', 'jp'], adjustment: 0.03 },
  { keywords: ['독일', 'germany', 'de'], adjustment: 0.03 },
  { keywords: ['미국', 'usa', 'us', 'america'], adjustment: 0.03 },
]

/** 할인 원산지 (마진 차감 → 경쟁가) */
const DISCOUNT_ORIGINS: ReadonlyArray<{ keywords: readonly string[]; adjustment: number }> = [
  { keywords: ['중국', 'china', 'cn'], adjustment: -0.03 },
]

/** 무시할 원산지 값 */
const IGNORE_VALUES = ['해당없음', '.', '1', '']

/**
 * 원산지에 따른 마진율 조정값 반환
 *
 * @param origin 원산지 문자열 (도매꾹 detail.country)
 * @returns 마진율 조정값 (양수=프리미엄, 음수=할인, 0=중립)
 */
export function getOriginMarginAdjustment(origin: string | null | undefined): number {
  if (!origin) return 0

  const cleaned = origin.trim().toLowerCase()
  if (IGNORE_VALUES.includes(cleaned) || cleaned.length === 0) return 0

  // 프리미엄 체크
  for (const entry of PREMIUM_ORIGINS) {
    if (entry.keywords.some((kw) => cleaned.includes(kw.toLowerCase()))) {
      return entry.adjustment
    }
  }

  // 할인 체크
  for (const entry of DISCOUNT_ORIGINS) {
    if (entry.keywords.some((kw) => cleaned.includes(kw.toLowerCase()))) {
      return entry.adjustment
    }
  }

  return 0
}
