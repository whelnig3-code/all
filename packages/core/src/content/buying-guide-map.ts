// =============================================
// 카테고리별 구매 가이드 콘텐츠 맵
//
// 비유: 전자제품 매장의 "비교 안내판".
// 냉장고 코너에 가면 "용량별 추천 가이드"가 있듯이,
// 공구 소모품도 "재질별/규격별 선택 가이드"를 제공한다.
//
// 이 콘텐츠가 알리/테무와의 결정적 차이점.
// =============================================

export interface BuyingGuide {
  readonly title: string
  readonly items: readonly string[]
}

/** 카테고리 키워드 → 구매 가이드 매핑 */
const GUIDE_MAP: ReadonlyArray<{
  keywords: readonly string[]
  guide: BuyingGuide
}> = [
  {
    keywords: ['드릴비트', '드릴 비트', '비트세트'],
    guide: {
      title: '드릴비트 선택 가이드 — 재질별 용도',
      items: [
        'HSS(고속도강): 일반 금속, 나무, 플라스틱 — 가장 범용적',
        '코발트(Co): 스테인리스, 경합금 — HSS로 안 뚫리는 금속에 사용',
        '초경(카바이드): 콘크리트, 석재, 타일 — 해머드릴 전용',
        '스텝드릴: 얇은 철판, 배관 — 여러 직경을 한 비트로',
        '홀쏘: 큰 구멍 뚫기 (배관, 배선) — 직경 확인 필수',
      ],
    },
  },
  {
    keywords: ['연마', '디스크', '그라인더', '절단석', '플랩'],
    guide: {
      title: '그라인더 디스크 선택 가이드 — 용도별 구분',
      items: [
        '절단 디스크: 금속/철근 절단 전용 — 두께 1~1.6mm, 얇을수록 빠른 절단',
        '연마 디스크: 용접 비드 제거, 표면 연마 — 두께 6mm 이상',
        '플랩 디스크: 정밀 연마, 마감 작업 — #40(거친)~#120(고운)',
        '와이어 디스크: 녹 제거, 페인트 벗기기 — 꼬임/평면 선택',
        '다이아몬드 디스크: 콘크리트, 석재, 타일 — 건식/습식 확인',
      ],
    },
  },
  {
    keywords: ['절단날', '톱날', '원형톱', '직소날'],
    guide: {
      title: '절단날 선택 가이드 — 이빨 수(T)에 따른 차이',
      items: [
        '24T: 거친 절단, 목재 빠른 절단 — 속도 우선',
        '40T: 범용 — 목재 + 합판 겸용, 가장 많이 사용',
        '60T: 정밀 절단 — 마감재, 합판, 깨끗한 단면 필요시',
        '80T 이상: 알루미늄, 플라스틱 — 미세 이빨로 깔끔한 절단',
        '금속 전용날: 별도 TCT/HSS 날 — 일반 목재날로 금속 절단 금지',
      ],
    },
  },
  {
    keywords: ['샌딩', '사포', '연마지', '벨트'],
    guide: {
      title: '샌딩페이퍼 선택 가이드 — 번수(방)별 용도',
      items: [
        '#40~#60(거친): 페인트/코팅 제거, 초벌 연마',
        '#80~#120(중간): 목재 기본 연마, 형태 잡기',
        '#150~#220(고운): 마감 전 연마, 프라이머 전 처리',
        '#320~#400(미세): 도장 사이 연마, 금속 표면 처리',
        '#600 이상(초미세): 최종 마감, 광택 작업',
      ],
    },
  },
  {
    keywords: ['배터리', '충전기', '충전'],
    guide: {
      title: '충전 배터리 선택 가이드 — 전압별 차이',
      items: [
        '10.8V: 경작업 (조립, 나사 조임) — 가볍고 휴대 편리',
        '14.4V: 중간 작업 — 가정용 DIY에 적합',
        '18V: 전문가용 — 대부분의 현장 작업 대응 가능',
        '36V(=18Vx2): 고출력 — 그라인더, 원형톱 구동',
        '호환성 주의: 같은 브랜드 + 같은 전압 시리즈만 호환',
      ],
    },
  },
]

/**
 * 상품명/카테고리에 맞는 구매 가이드 반환
 *
 * @param nameOrCategory 상품명 또는 카테고리명
 * @returns 매칭된 가이드 또는 null
 */
export function getBuyingGuide(nameOrCategory: string): BuyingGuide | null {
  const lower = nameOrCategory.toLowerCase()
  for (const entry of GUIDE_MAP) {
    if (entry.keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      return entry.guide
    }
  }
  return null
}

/**
 * 구매 가이드 HTML 생성
 */
export function getBuyingGuideHtml(nameOrCategory: string): string {
  const guide = getBuyingGuide(nameOrCategory)
  if (!guide) return ''

  const itemsHtml = guide.items
    .map((item) => {
      const [title, ...rest] = item.split(' — ')
      const desc = rest.join(' — ')
      return (
        `<li style="padding:6px 0;font-size:14px;">` +
        `<strong>${title}</strong>${desc ? ` — <span style="color:#666;">${desc}</span>` : ''}` +
        `</li>`
      )
    })
    .join('')

  return (
    `<div style="max-width:860px;margin:0 auto;padding:20px 0;border-top:1px solid #eee;">` +
    `<h2 style="font-size:18px;font-weight:600;margin:0 0 12px;">` +
    `구매 가이드: ${guide.title}</h2>` +
    `<ul style="list-style:none;padding:0;margin:0;">${itemsHtml}</ul>` +
    `</div>`
  )
}
