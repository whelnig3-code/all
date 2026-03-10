// =============================================
// 상품 스코어링 엔진 (고마진 저경쟁 중심)
// 등록 전 상품 품질을 0-100 점수로 평가
// 75점 미만은 등록 차단 (shouldRegister = false)
// =============================================

/** 등록 허용 최소 점수 */
export const SCORE_THRESHOLD = 75

/** 항목별 가중치 (합계 = 1.0) */
const WEIGHTS = {
  margin:      0.50, // 마진율 (50%)
  competitors: 0.25, // 경쟁사 수 (25%)
  priceDiff:   0.15, // 가격 차이 (15%)
  reviews:     0.05, // 공급처 리뷰 수 (5%)
  category:    0.05, // 카테고리 분류 정확도 (5%)
} as const

export interface ProductScoreInput {
  /** 실제 마진율 (0~1) — calculateWholesalePrice 반환값 */
  marginRate: number
  /** 경쟁사 수 (기본값: 0) */
  competitorCount?: number
  /** 우리 판매가 (원) */
  ourPrice?: number
  /** 최저 경쟁가 (원, 없으면 중립 점수 적용) */
  lowestCompetitorPrice?: number
  /** 공급처 리뷰 수 (기본값: 0) */
  sourceReviewCount?: number
  /** 네이버 카테고리 ID 보유 여부 */
  hasNaverCategory: boolean
}

export interface ProductScoreResult {
  /** 총 점수 (0~100) */
  totalScore: number
  /** 항목별 세부 점수 */
  breakdown: {
    margin: number
    competitors: number
    priceDiff: number
    reviews: number
    category: number
  }
  /** 등록 허용 여부 (totalScore >= SCORE_THRESHOLD) */
  shouldRegister: boolean
  /** 차단 사유 (shouldRegister = false인 경우에만 설정) */
  blockedReason?: string
}

/**
 * 마진율 점수 (0 | 30 | 70 | 100)
 * - 15~20% 미만: 0점
 * - 20~25% 미만: 30점
 * - 25~35% 미만: 70점
 * - 35% 이상:    100점
 */
function scoreMargin(marginRate: number): number {
  if (marginRate >= 0.35) return 100
  if (marginRate >= 0.25) return 70
  if (marginRate >= 0.20) return 30
  return 0
}

/**
 * 경쟁사 수 점수 (0 | 40 | 70 | 100)
 * - 0~20명 이하:   100점
 * - 21~50명 이하:  70점
 * - 51~100명 이하: 40점
 * - 101명 이상:    0점
 */
function scoreCompetitors(count: number): number {
  if (count <= 20)  return 100
  if (count <= 50)  return 70
  if (count <= 100) return 40
  return 0
}

/**
 * 가격 차이 점수 (0 | 40 | 70 | 100)
 * diffRatio = (최저경쟁가 - 우리가격) / 최저경쟁가
 * - 경쟁가 데이터 없음:    중립 55점
 * - 5% 이상 저렴:          100점
 * - 0~5% 미만 저렴(동일):  70점
 * - 0~5% 미만 비쌈:        40점
 * - 5% 이상 비쌈:          0점
 */
function scorePriceDiff(ourPrice?: number, lowestCompetitorPrice?: number): number {
  if (ourPrice == null || lowestCompetitorPrice == null || lowestCompetitorPrice === 0) {
    return 55 // 데이터 없음 → 중립
  }
  const diffRatio = (lowestCompetitorPrice - ourPrice) / lowestCompetitorPrice
  if (diffRatio >= 0.05)  return 100
  if (diffRatio >= 0)     return 70
  if (diffRatio > -0.05)  return 40
  return 0
}

/**
 * 리뷰 수 점수 (30 | 70 | 100)
 * - 0~9개:   30점
 * - 10~49개: 70점
 * - 50개 이상: 100점
 */
function scoreReviews(reviewCount: number): number {
  if (reviewCount >= 50) return 100
  if (reviewCount >= 10) return 70
  return 30
}

/**
 * 카테고리 분류 정확도 점수 (0 또는 100)
 * - 네이버 카테고리 ID 설정 시 100점
 */
function scoreCategory(hasNaverCategory: boolean): number {
  return hasNaverCategory ? 100 : 0
}

/**
 * 상품 등록 적합성 종합 점수 계산
 *
 * @param input 스코어링 입력 파라미터
 * @returns 총 점수, 항목별 세부 점수, 등록 허용 여부
 */
export function calculateProductScore(input: ProductScoreInput): ProductScoreResult {
  const {
    marginRate,
    competitorCount = 0,
    ourPrice,
    lowestCompetitorPrice,
    sourceReviewCount = 0,
    hasNaverCategory,
  } = input

  const breakdown = {
    margin:      scoreMargin(marginRate),
    competitors: scoreCompetitors(competitorCount),
    priceDiff:   scorePriceDiff(ourPrice, lowestCompetitorPrice),
    reviews:     scoreReviews(sourceReviewCount),
    category:    scoreCategory(hasNaverCategory),
  }

  // 가중 합산 후 정수로 반올림
  const totalScore = Math.round(
    breakdown.margin      * WEIGHTS.margin      +
    breakdown.competitors * WEIGHTS.competitors +
    breakdown.priceDiff   * WEIGHTS.priceDiff   +
    breakdown.reviews     * WEIGHTS.reviews     +
    breakdown.category    * WEIGHTS.category
  )

  const shouldRegister = totalScore >= SCORE_THRESHOLD

  return {
    totalScore,
    breakdown,
    shouldRegister,
    blockedReason: shouldRegister
      ? undefined
      : `종합 스코어 ${totalScore}점 (임계값: ${SCORE_THRESHOLD}점)`,
  }
}
