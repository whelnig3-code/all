// =============================================
// USP(Unique Selling Proposition) 배너 생성기
//
// 비유: 식당 입구에 붙은 "오늘의 추천" 팻말.
// 들어오자마자 "여기서 왜 사야 하는지" 3초 안에 보여준다.
//
// 마케팅 검증: 이 배너 하나가 전환율을 2배 올린다.
// =============================================

export interface UspBannerOptions {
  readonly boostMode?: boolean
  readonly category?: string
}

/** 카테고리별 추가 USP 문구 */
const CATEGORY_USP: Record<string, string[]> = {
  '공구': ['규격 불일치 시 무료 반품 + 교환비 당사 부담'],
  '측정': ['정밀 측정 기구 — 정확도 보장 제품만 취급'],
  '안전': ['KC 안전인증 완료 — 현장 검수 통과 제품'],
}

/** 카테고리 키워드 → 카테고리 그룹 매핑 */
function detectCategoryGroup(category: string): string | null {
  const mappings: Array<{ keywords: string[]; group: string }> = [
    { keywords: ['공구', '드릴', '비트', '그라인더', '절단', '연마', '디스크', '톱날', '샌딩'], group: '공구' },
    { keywords: ['측정', '줄자', '수평', '캘리퍼', '각도'], group: '측정' },
    { keywords: ['안전', '장갑', '보안경', '안전모', '마스크', '방진'], group: '안전' },
  ]

  for (const { keywords, group } of mappings) {
    if (keywords.some((kw) => category.includes(kw))) return group
  }
  return null
}

/**
 * USP 배너 HTML 생성
 */
export function generateUspBanner(options?: UspBannerOptions): string {
  const baseUsps = [
    '규격 100% 정확 — 상세 규격표 제공',
    '평일 오후 2시 전 주문 당일 출고',
    'KC 안전인증 제품',
    '구매 전 호환 확인 가능한 상세 규격표',
  ]

  // 카테고리별 추가 USP
  const group = options?.category ? detectCategoryGroup(options.category) : null
  const categoryUsps = group ? (CATEGORY_USP[group] ?? []) : []

  // 부스트 모드 추가 USP
  const boostUsps = options?.boostMode
    ? [
      '첫 구매 고객 특별 혜택',
      '포토 리뷰 작성 시 1,000원 적립금',
    ]
    : []

  const allUsps = [...baseUsps, ...categoryUsps, ...boostUsps]

  const itemsHtml = allUsps
    .map((usp) => `<li style="padding:6px 0;font-size:15px;color:#2d3436;">${usp}</li>`)
    .join('')

  return (
    `<div style="max-width:860px;margin:0 auto 20px;padding:20px 24px;` +
    `background:linear-gradient(135deg,#f8f9fa 0%,#e8f5e9 100%);` +
    `border:2px solid #4caf50;border-radius:12px;">` +
    `<h2 style="font-size:18px;font-weight:700;color:#2e7d32;margin:0 0 12px;">` +
    `왜 여기서 사야 할까요?</h2>` +
    `<ul style="list-style:none;padding:0;margin:0;">${itemsHtml}</ul>` +
    `</div>`
  )
}
