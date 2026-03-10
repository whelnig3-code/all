// =============================================
// 상품 카테고리 분류 — "세상의 모든 공구"
//
// 비유: 도서관의 분류 체계. 책(상품)이 들어오면
// 어느 서가(카테고리)에 놓을지 자동으로 판단한다.
// 손님(고객)은 서가별로 원하는 책을 쉽게 찾을 수 있다.
//
// 전동공구, 수동공구, 생활도구, 원예, 배관, 전기, 자동차 등
// 모든 공구/도구를 포괄하는 카테고리 체계.
// =============================================

interface NicheCategory {
  readonly name: string
  readonly keywords: readonly string[]
  readonly baseScore: number
  /** 반복 구매 가능성 가산점 */
  readonly repeatBonus: number
  /** 상위 분류 (다중 계정 전략에서 사용) */
  readonly group: string
}

/** 카테고리 그룹 상수 */
export const CATEGORY_GROUPS = [
  '전동공구 소모품',
  '수동공구',
  '측정/안전',
  '생활도구',
  '배관/설비',
  '전기/조명',
  '원예/농업',
  '자동차/정비',
  '페인트/도장',
  '용접/납땜',
] as const

export type CategoryGroup = (typeof CATEGORY_GROUPS)[number]

/** 전체 카테고리 정의 — 세상의 모든 공구 */
export const NICHE_CATEGORIES: readonly NicheCategory[] = [
  // ─── 전동공구 소모품 ───
  {
    name: '드릴비트',
    keywords: ['드릴비트', '드릴 비트', '비트세트', '비트 세트', '홀쏘', '홀소', '스텝드릴'],
    baseScore: 40,
    repeatBonus: 20,
    group: '전동공구 소모품',
  },
  {
    name: '그라인더 디스크',
    keywords: ['절단석', '절단 디스크', '연마 디스크', '연마석', '플랩디스크', '와이어디스크', '그라인더 디스크', '다이아몬드 디스크'],
    baseScore: 40,
    repeatBonus: 25,
    group: '전동공구 소모품',
  },
  {
    name: '절단날',
    keywords: ['원형톱날', '직소날', '톱날', '절단날', '금속절단'],
    baseScore: 35,
    repeatBonus: 15,
    group: '전동공구 소모품',
  },
  {
    name: '샌딩/연마',
    keywords: ['사포', '샌딩', '연마지', '샌드페이퍼', '벨트샌더'],
    baseScore: 35,
    repeatBonus: 20,
    group: '전동공구 소모품',
  },
  {
    name: '충전배터리',
    keywords: ['충전배터리', '충전기', '배터리팩', '호환배터리'],
    baseScore: 30,
    repeatBonus: 10,
    group: '전동공구 소모품',
  },
  // ─── 수동공구 ───
  {
    name: '렌치/스패너',
    keywords: ['렌치', '스패너', '복스', '소켓', '래칫', '몽키', '토크렌치', '육각렌치', '알렌'],
    baseScore: 35,
    repeatBonus: 10,
    group: '수동공구',
  },
  {
    name: '드라이버',
    keywords: ['드라이버', '십자드라이버', '일자드라이버', '정밀드라이버', '전동드라이버', '비트드라이버'],
    baseScore: 35,
    repeatBonus: 10,
    group: '수동공구',
  },
  {
    name: '펜치/플라이어',
    keywords: ['펜치', '플라이어', '니퍼', '뺀치', '롱노우즈', '바이스그립', '워터펌프'],
    baseScore: 30,
    repeatBonus: 10,
    group: '수동공구',
  },
  {
    name: '망치/해머',
    keywords: ['망치', '해머', '고무망치', '쇠망치', '빠루', '정', '끌'],
    baseScore: 25,
    repeatBonus: 5,
    group: '수동공구',
  },
  {
    name: '톱/절단',
    keywords: ['톱', '쇠톱', '목공톱', '파이프커터', '케이블커터', '볼트커터', '타일커터'],
    baseScore: 30,
    repeatBonus: 10,
    group: '수동공구',
  },
  // ─── 측정/안전 ───
  {
    name: '측정도구',
    keywords: ['줄자', '수평기', '캘리퍼스', '각도기', '레이저거리측정', '레벨', '버니어', '마이크로미터'],
    baseScore: 25,
    repeatBonus: 5,
    group: '측정/안전',
  },
  {
    name: '안전장비',
    keywords: ['작업장갑', '장갑', '보안경', '안전모', '방진마스크', '안면보호', '무릎보호대', '안전화', '안전조끼', '귀마개'],
    baseScore: 25,
    repeatBonus: 15,
    group: '측정/안전',
  },
  {
    name: '공구함/정리',
    keywords: ['공구함', '공구가방', '부품함', '공구박스', '툴박스', '공구벨트', '툴백'],
    baseScore: 20,
    repeatBonus: 5,
    group: '측정/안전',
  },
  // ─── 원예/농업 ─── (생활도구보다 먼저: 전지가위→원예, 가위→생활 순서 보장)
  {
    name: '원예도구',
    keywords: ['원예', '전지가위', '전정가위', '삽', '호미', '갈퀴', '분무기', '잔디', '예초기', '화분', '모종삽', '전동톱'],
    baseScore: 25,
    repeatBonus: 10,
    group: '원예/농업',
  },
  // ─── 생활도구 ───
  {
    name: '생활공구',
    keywords: ['멀티툴', '다용도', '칼', '커터칼', '가위', '접착제', '글루건', '테이프', '케이블타이', '압축봉', '선반', '못', '나사', '나사못', '타카핀'],
    baseScore: 25,
    repeatBonus: 15,
    group: '생활도구',
  },
  {
    name: '청소도구',
    keywords: ['고압세척', '청소솔', '스팀청소', '먼지제거', '에어건', '에어블로어', '진공청소', '물걸레'],
    baseScore: 20,
    repeatBonus: 15,
    group: '생활도구',
  },
  // ─── 배관/설비 ───
  {
    name: '배관공구',
    keywords: ['배관', '파이프', '수도', '동파방지', '니플', '밸브', '피팅', '호스', '스프링클러', '수전', '실리콘건', '코킹건'],
    baseScore: 30,
    repeatBonus: 15,
    group: '배관/설비',
  },
  // ─── 전기/조명 ───
  {
    name: '전기공구',
    keywords: ['전선', '전기케이블', '전기테이프', '단자', '커넥터', '멀티탭', '테스터기', '검전기', '압착기', '와이어스트리퍼'],
    baseScore: 30,
    repeatBonus: 15,
    group: '전기/조명',
  },
  {
    name: '조명',
    keywords: ['작업등', '헤드랜턴', '랜턴', 'LED등', '투광기', '후레쉬', '손전등', '작업조명'],
    baseScore: 20,
    repeatBonus: 5,
    group: '전기/조명',
  },
  // ─── 자동차/정비 ───
  {
    name: '자동차공구',
    keywords: ['자동차', '정비', '오일필터', '잭', '리프트', '타이어', '에어컴프레셔', '브레이크', '스프레이건', '오일교환', '차량용'],
    baseScore: 30,
    repeatBonus: 10,
    group: '자동차/정비',
  },
  // ─── 페인트/도장 ───
  {
    name: '페인트/도장',
    keywords: ['페인트', '붓', '롤러', '도장', '마스킹', '퍼티', '스프레이', '프라이머', '코팅', '방수', '실란트'],
    baseScore: 25,
    repeatBonus: 15,
    group: '페인트/도장',
  },
  // ─── 용접/납땜 ───
  {
    name: '용접/납땜',
    keywords: ['용접', '납땜', '인두기', '용접봉', '용접기', '토치', '플럭스', '납', '히팅건'],
    baseScore: 30,
    repeatBonus: 10,
    group: '용접/납땜',
  },
]

/** 소모품/세트 키워드 (반복구매 가산) */
const CONSUMABLE_KEYWORDS = ['매입', '매', '세트', '본', '개입', 'pcs', '켤레', '벌', '조']

/** 스펙 키워드 (전문성 가산) */
const SPEC_KEYWORDS = ['mm', 'cm', 'HSS', '코발트', '초경', 'SDS', '인치', 'T', 'V', 'W', '#']

export interface CategoryClassification {
  readonly category: string
  readonly group: string
}

/**
 * 상품명으로 카테고리 분류
 * 매칭되는 카테고리명 반환, 없으면 "기타"
 */
export function classifyNicheCategory(productName: string): string {
  if (!productName.trim()) return '기타'

  const lower = productName.toLowerCase()
  const matched = NICHE_CATEGORIES.find((cat) =>
    cat.keywords.some((kw) => lower.includes(kw.toLowerCase())),
  )

  return matched?.name ?? '기타'
}

/**
 * 상품명으로 카테고리 + 그룹 분류 (상세 버전)
 */
export function classifyProduct(productName: string): CategoryClassification {
  if (!productName.trim()) return { category: '기타', group: '기타' }

  const lower = productName.toLowerCase()
  const matched = NICHE_CATEGORIES.find((cat) =>
    cat.keywords.some((kw) => lower.includes(kw.toLowerCase())),
  )

  return matched
    ? { category: matched.name, group: matched.group }
    : { category: '기타', group: '기타' }
}

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
