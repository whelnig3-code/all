// =============================================
// 스마트 상품 선별 — 니치 최적화 (Phase B-1)
//
// 비유: 낚시할 때 아무 데서나 낚시대를 드리우면 안 잡힌다.
// 물고기가 모이는 포인트(니치)에서 정확한 미끼(소모품)를 써야 한다.
//
// 도매꾹 상품 중 "공구 소모품" 니치에 맞는 상품을 자동 감지 + 점수화
// =============================================

interface NicheCategory {
  readonly name: string
  readonly keywords: readonly string[]
  readonly baseScore: number
  /** 반복 구매 가능성 가산점 */
  readonly repeatBonus: number
}

/** 니치 카테고리 정의 (1차: 공구 소모품, 2차: 측정/안전) */
export const NICHE_CATEGORIES: readonly NicheCategory[] = [
  // 1차 니치: 전동공구 소모품
  {
    name: '드릴비트',
    keywords: ['드릴비트', '드릴 비트', '비트세트', '비트 세트', '홀쏘', '홀소', '스텝드릴'],
    baseScore: 40,
    repeatBonus: 20,
  },
  {
    name: '그라인더 디스크',
    keywords: ['절단석', '절단 디스크', '연마 디스크', '연마석', '플랩디스크', '와이어디스크', '그라인더', '다이아몬드 디스크'],
    baseScore: 40,
    repeatBonus: 25,
  },
  {
    name: '절단날',
    keywords: ['원형톱날', '직소날', '톱날', '절단날', '금속절단'],
    baseScore: 35,
    repeatBonus: 15,
  },
  {
    name: '샌딩/연마',
    keywords: ['사포', '샌딩', '연마지', '샌드페이퍼', '벨트샌더'],
    baseScore: 35,
    repeatBonus: 20,
  },
  {
    name: '충전배터리',
    keywords: ['충전배터리', '충전기', '배터리팩', '호환배터리'],
    baseScore: 30,
    repeatBonus: 10,
  },
  // 2차 니치: 측정 & 안전
  {
    name: '측정도구',
    keywords: ['줄자', '수평기', '캘리퍼스', '각도기', '레이저거리측정', '레벨'],
    baseScore: 25,
    repeatBonus: 5,
  },
  {
    name: '안전장비',
    keywords: ['작업장갑', '장갑', '보안경', '안전모', '방진마스크', '안면보호', '무릎보호대'],
    baseScore: 25,
    repeatBonus: 15,
  },
  {
    name: '공구함/정리',
    keywords: ['공구함', '공구가방', '부품함', '공구박스', '툴박스'],
    baseScore: 20,
    repeatBonus: 5,
  },
]

/** 소모품/세트 키워드 (반복구매 가산) */
const CONSUMABLE_KEYWORDS = ['매입', '매', '세트', '본', '개입', 'pcs', '켤레', '벌', '조']

/** 스펙 키워드 (전문성 가산) */
const SPEC_KEYWORDS = ['mm', 'cm', 'HSS', '코발트', '초경', 'SDS', '인치', 'T', 'V', 'W', '#']

/**
 * 상품이 니치 카테고리에 해당하는지 판별
 */
export function isNicheProduct(productName: string): boolean {
  const lower = productName.toLowerCase()
  return NICHE_CATEGORIES.some((cat) =>
    cat.keywords.some((kw) => lower.includes(kw.toLowerCase())),
  )
}

/**
 * 니치 상품 점수 계산 (0~100)
 *
 * 구성:
 *   - 기본 점수 (카테고리 매칭): 20~40
 *   - 반복 구매 보너스: 5~25
 *   - 적정 가격대 보너스: 0~15
 *   - 소모품/세트 보너스: 0~10
 *   - 스펙 키워드 보너스: 0~10
 */
export function calculateNicheScore(input: {
  readonly productName: string
  readonly wholesalePrice: number
  readonly category?: string
}): number {
  const { productName, wholesalePrice } = input
  const lower = productName.toLowerCase()

  // 카테고리 매칭
  const matched = NICHE_CATEGORIES.find((cat) =>
    cat.keywords.some((kw) => lower.includes(kw.toLowerCase())),
  )
  if (!matched) return 0

  let score = matched.baseScore + matched.repeatBonus

  // 적정 가격대 보너스 (도매가 3,000~30,000원)
  if (wholesalePrice >= 3000 && wholesalePrice <= 30000) {
    score += 15
  } else if (wholesalePrice >= 1000 && wholesalePrice <= 50000) {
    score += 5
  }

  // 소모품/세트 보너스
  if (CONSUMABLE_KEYWORDS.some((kw) => lower.includes(kw))) {
    score += 10
  }

  // 스펙 키워드 보너스
  const specCount = SPEC_KEYWORDS.filter((kw) => productName.includes(kw)).length
  score += Math.min(specCount * 3, 10)

  return Math.min(score, 100)
}
