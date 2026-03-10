// =============================================
// 노출 가능성 점수 계산기 (공구 카테고리 최적화)
//
// 목적:
//   네이버 쇼핑 검색 결과 상위 노출 가능성을 0~100 점수로 평가.
//   60점 미만이면 등록해도 검색 유입이 어려운 키워드로 판단 → 등록 제외.
//
// 평가 항목 (가중치 합계 = 1.0):
//   광고 수     (30%) — 많을수록 경쟁 심화 → 낮은 점수
//   평균 리뷰   (25%) — 많을수록 기성 셀러 우위 → 낮은 점수
//   브랜드 수   (25%) — 많을수록 노출 순위 밀림 → 낮은 점수
//   가격 경쟁력 (20%) — 상위 평균가 대비 저렴할수록 → 높은 점수
// =============================================

/** 노출 가능성 점수 하한 — 미달 시 등록 제외 */
export const EXPOSURE_SCORE_THRESHOLD = 60

/** 항목별 가중치 (합계 = 1.0) */
const WEIGHTS = {
  adCount: 0.30,
  review:  0.25,
  brand:   0.25,
  price:   0.20,
} as const

/** 노출 가능성 점수 입력 */
export interface ExposureScoreInput {
  /** 광고 상품 수 (fetchTop20Products 반환값) */
  adCount: number
  /** 상위 상품 평균 리뷰 수 */
  avgReview: number
  /** 상위 10개 중 브랜드 상품 수 (0~10) */
  brandCountTop10: number
  /** 상위 상품 평균 가격 (원, 0이면 중립 처리) */
  avgTopPrice: number
  /** 우리 판매가 (원) */
  myPrice: number
}

// =============================================
// 항목별 점수 함수
// =============================================

/**
 * 광고 수 점수 (광고 많을수록 경쟁 심화)
 * - 0~2개:  100점 (광고 거의 없음 = 유기적 경쟁)
 * - 3~5개:   70점
 * - 6~9개:   40점
 * - 10개 이상: 0점
 */
function scoreAdCount(count: number): number {
  if (count <= 2) return 100
  if (count <= 5) return 70
  if (count <= 9) return 40
  return 0
}

/**
 * 평균 리뷰 수 점수 (리뷰 많을수록 신규 진입 불리)
 * - 0~50개:    100점
 * - 51~200개:   70점
 * - 201~1000개: 40점
 * - 1001개 이상:  0점
 */
function scoreReview(avg: number): number {
  if (avg <= 50)   return 100
  if (avg <= 200)  return 70
  if (avg <= 1000) return 40
  return 0
}

/**
 * 브랜드 상품 수 점수 (브랜드 많을수록 상위 노출 어려움)
 * - 0~1개: 100점
 * - 2~3개:  70점
 * - 4~6개:  40점
 * - 7개 이상:  0점
 */
function scoreBrand(brandCount: number): number {
  if (brandCount <= 1) return 100
  if (brandCount <= 3) return 70
  if (brandCount <= 6) return 40
  return 0
}

/**
 * 가격 경쟁력 점수 (상위 평균가 대비 우리 가격)
 * diffRatio = (avgTopPrice - myPrice) / avgTopPrice
 * - avgTopPrice = 0: 데이터 없음 → 중립 55점
 * - 5% 이상 저렴:          100점
 * - 0~5% 미만 저렴(동일):  70점
 * - 0~5% 미만 비쌈:        40점
 * - 5% 이상 비쌈:           0점
 */
function scorePrice(avgTopPrice: number, myPrice: number): number {
  if (avgTopPrice <= 0) return 55 // 데이터 없음 → 중립
  const diffRatio = (avgTopPrice - myPrice) / avgTopPrice
  if (diffRatio >= 0.05)  return 100
  if (diffRatio >= 0)     return 70
  if (diffRatio > -0.05)  return 40
  return 0
}

// =============================================
// 공개 API
// =============================================

/**
 * 노출 가능성 종합 점수 계산 (0~100)
 *
 * @param input 스코어링 입력 (fetchTop20Products 결과 + myPrice)
 * @returns 0~100 점수 (EXPOSURE_SCORE_THRESHOLD = 60)
 *
 * @example
 * const score = calculateExposureScore({
 *   adCount: 3, avgReview: 120, brandCountTop10: 2,
 *   avgTopPrice: 25000, myPrice: 22000,
 * })
 * // → 74 (통과)
 */
export function calculateExposureScore(input: ExposureScoreInput): number {
  const { adCount, avgReview, brandCountTop10, avgTopPrice, myPrice } = input

  return Math.round(
    scoreAdCount(adCount)    * WEIGHTS.adCount +
    scoreReview(avgReview)   * WEIGHTS.review  +
    scoreBrand(brandCountTop10) * WEIGHTS.brand +
    scorePrice(avgTopPrice, myPrice) * WEIGHTS.price
  )
}
