// =============================================
// 노출 가능성 점수 계산기 단위 테스트
// 각 항목 구간별 경계값 + 통합 시나리오 검증
// =============================================

import {
  calculateExposureScore,
  EXPOSURE_SCORE_THRESHOLD,
  type ExposureScoreInput,
} from './exposure-scorer'

// =============================================
// 테스트 헬퍼
// =============================================

/** 모든 조건 최적 입력 — 일부 항목만 override 가능 */
function allBest(override: Partial<ExposureScoreInput> = {}): ExposureScoreInput {
  return {
    adCount: 0,          // 100점
    avgReview: 0,        // 100점
    brandCountTop10: 0,  // 100점
    avgTopPrice: 10000,
    myPrice: 9000,       // 10% 저렴 → 100점
    ...override,
  }
}

// =============================================
// 테스트 케이스
// =============================================

describe('EXPOSURE_SCORE_THRESHOLD', () => {
  it('임계값은 60이어야 한다', () => {
    expect(EXPOSURE_SCORE_THRESHOLD).toBe(60)
  })
})

describe('calculateExposureScore — 전체 시나리오', () => {
  it('모든 조건 최적 → 100점', () => {
    // 100*0.30 + 100*0.25 + 100*0.25 + 100*0.20 = 100
    const score = calculateExposureScore(allBest())
    expect(score).toBe(100)
  })

  it('모든 조건 최악 → 0점', () => {
    // 0*0.30 + 0*0.25 + 0*0.25 + 0*0.20 = 0
    const score = calculateExposureScore({
      adCount: 10,
      avgReview: 1500,
      brandCountTop10: 8,
      avgTopPrice: 10000,
      myPrice: 11000, // 10% 비쌈 → 0점
    })
    expect(score).toBe(0)
  })

  it('임계값(60점) 이상 → 등록 허용', () => {
    // 100*0.30 + 100*0.25 + 100*0.25 + 0*0.20 = 80 ≥ 60
    const score = calculateExposureScore({
      adCount: 2,        // 100점
      avgReview: 50,     // 100점
      brandCountTop10: 1, // 100점
      avgTopPrice: 20000,
      myPrice: 25000,    // 25% 비쌈 → 0점
    })
    expect(score).toBeGreaterThanOrEqual(EXPOSURE_SCORE_THRESHOLD)
    expect(score).toBe(80)
  })

  it('임계값(60점) 미달 → 등록 제외 대상', () => {
    // 0*0.30 + 0*0.25 + 0*0.25 + 100*0.20 = 20 < 60
    const score = calculateExposureScore({
      adCount: 10,        // 0점
      avgReview: 1001,    // 0점
      brandCountTop10: 7, // 0점
      avgTopPrice: 10000,
      myPrice: 9000,      // 10% 저렴 → 100점
    })
    expect(score).toBeLessThan(EXPOSURE_SCORE_THRESHOLD)
    expect(score).toBe(20)
  })

  it('파일 예시 검증: adCount=3, avgReview=120, brandCountTop10=2, avgTopPrice=25000, myPrice=22000', () => {
    // adCount:3 → 70, avgReview:120 → 70, brand:2 → 70, price diff 12% → 100
    // 70*0.30 + 70*0.25 + 70*0.25 + 100*0.20 = 21 + 17.5 + 17.5 + 20 = 76
    const score = calculateExposureScore({
      adCount: 3,
      avgReview: 120,
      brandCountTop10: 2,
      avgTopPrice: 25000,
      myPrice: 22000,
    })
    expect(score).toBe(76)
  })
})

// =============================================
// 광고 수 (adCount) 구간별 점수 — 가중치 30%
// =============================================
describe('광고 수 점수 (adCount, 30%)', () => {
  it('0개 → 100점 구간 (경쟁 없음)', () => {
    // 100*0.30 + 100*0.25 + 100*0.25 + 100*0.20 = 100
    expect(calculateExposureScore(allBest({ adCount: 0 }))).toBe(100)
  })

  it('2개 → 100점 구간 (상한 경계)', () => {
    expect(calculateExposureScore(allBest({ adCount: 2 }))).toBe(100)
  })

  it('3개 → 70점 구간 (하한 경계)', () => {
    // 70*0.30 + 100*0.25 + 100*0.25 + 100*0.20 = 21 + 25 + 25 + 20 = 91
    expect(calculateExposureScore(allBest({ adCount: 3 }))).toBe(91)
  })

  it('5개 → 70점 구간 (상한 경계)', () => {
    expect(calculateExposureScore(allBest({ adCount: 5 }))).toBe(91)
  })

  it('6개 → 40점 구간 (하한 경계)', () => {
    // 40*0.30 + 100*0.25 + 100*0.25 + 100*0.20 = 12 + 25 + 25 + 20 = 82
    expect(calculateExposureScore(allBest({ adCount: 6 }))).toBe(82)
  })

  it('9개 → 40점 구간 (상한 경계)', () => {
    expect(calculateExposureScore(allBest({ adCount: 9 }))).toBe(82)
  })

  it('10개 → 0점 구간 (광고 포화)', () => {
    // 0*0.30 + 100*0.25 + 100*0.25 + 100*0.20 = 0 + 25 + 25 + 20 = 70
    expect(calculateExposureScore(allBest({ adCount: 10 }))).toBe(70)
  })

  it('20개 → 0점 구간', () => {
    expect(calculateExposureScore(allBest({ adCount: 20 }))).toBe(70)
  })
})

// =============================================
// 평균 리뷰 수 (avgReview) 구간별 — 가중치 25%
// =============================================
describe('평균 리뷰 수 점수 (avgReview, 25%)', () => {
  it('0개 → 100점 구간', () => {
    expect(calculateExposureScore(allBest({ avgReview: 0 }))).toBe(100)
  })

  it('50개 → 100점 구간 (상한 경계)', () => {
    expect(calculateExposureScore(allBest({ avgReview: 50 }))).toBe(100)
  })

  it('51개 → 70점 구간 (하한 경계)', () => {
    // 100*0.30 + 70*0.25 + 100*0.25 + 100*0.20 = 30 + 17.5 + 25 + 20 = 92.5 → 93
    expect(calculateExposureScore(allBest({ avgReview: 51 }))).toBe(93)
  })

  it('200개 → 70점 구간 (상한 경계)', () => {
    expect(calculateExposureScore(allBest({ avgReview: 200 }))).toBe(93)
  })

  it('201개 → 40점 구간 (하한 경계)', () => {
    // 100*0.30 + 40*0.25 + 100*0.25 + 100*0.20 = 30 + 10 + 25 + 20 = 85
    expect(calculateExposureScore(allBest({ avgReview: 201 }))).toBe(85)
  })

  it('1000개 → 40점 구간 (상한 경계)', () => {
    expect(calculateExposureScore(allBest({ avgReview: 1000 }))).toBe(85)
  })

  it('1001개 → 0점 구간 (진입 불가 수준)', () => {
    // 100*0.30 + 0*0.25 + 100*0.25 + 100*0.20 = 30 + 0 + 25 + 20 = 75
    expect(calculateExposureScore(allBest({ avgReview: 1001 }))).toBe(75)
  })
})

// =============================================
// 브랜드 상품 수 (brandCountTop10) 구간별 — 가중치 25%
// =============================================
describe('브랜드 상품 수 점수 (brandCountTop10, 25%)', () => {
  it('0개 → 100점 구간', () => {
    expect(calculateExposureScore(allBest({ brandCountTop10: 0 }))).toBe(100)
  })

  it('1개 → 100점 구간 (상한 경계)', () => {
    expect(calculateExposureScore(allBest({ brandCountTop10: 1 }))).toBe(100)
  })

  it('2개 → 70점 구간 (하한 경계)', () => {
    // 100*0.30 + 100*0.25 + 70*0.25 + 100*0.20 = 30 + 25 + 17.5 + 20 = 92.5 → 93
    expect(calculateExposureScore(allBest({ brandCountTop10: 2 }))).toBe(93)
  })

  it('3개 → 70점 구간 (상한 경계)', () => {
    expect(calculateExposureScore(allBest({ brandCountTop10: 3 }))).toBe(93)
  })

  it('4개 → 40점 구간 (하한 경계)', () => {
    // 100*0.30 + 100*0.25 + 40*0.25 + 100*0.20 = 30 + 25 + 10 + 20 = 85
    expect(calculateExposureScore(allBest({ brandCountTop10: 4 }))).toBe(85)
  })

  it('6개 → 40점 구간 (상한 경계)', () => {
    expect(calculateExposureScore(allBest({ brandCountTop10: 6 }))).toBe(85)
  })

  it('7개 → 0점 구간 (브랜드 포화)', () => {
    // 100*0.30 + 100*0.25 + 0*0.25 + 100*0.20 = 30 + 25 + 0 + 20 = 75
    expect(calculateExposureScore(allBest({ brandCountTop10: 7 }))).toBe(75)
  })

  it('10개 → 0점 구간 (최대값)', () => {
    expect(calculateExposureScore(allBest({ brandCountTop10: 10 }))).toBe(75)
  })
})

// =============================================
// 가격 경쟁력 (price) 구간별 — 가중치 20%
// =============================================
describe('가격 경쟁력 점수 (price, 20%)', () => {
  it('avgTopPrice = 0 → 중립 55점 (데이터 없음)', () => {
    // 100*0.30 + 100*0.25 + 100*0.25 + 55*0.20 = 30 + 25 + 25 + 11 = 91
    expect(calculateExposureScore(allBest({ avgTopPrice: 0, myPrice: 10000 }))).toBe(91)
  })

  it('10% 저렴 (diffRatio = 0.10) → 100점 구간', () => {
    // diffRatio = (10000 - 9000) / 10000 = 0.10 ≥ 0.05
    expect(calculateExposureScore(allBest({ avgTopPrice: 10000, myPrice: 9000 }))).toBe(100)
  })

  it('정확히 5% 저렴 (diffRatio = 0.05) → 100점 구간 경계', () => {
    // diffRatio = (10000 - 9500) / 10000 = 0.05 ≥ 0.05
    expect(calculateExposureScore(allBest({ avgTopPrice: 10000, myPrice: 9500 }))).toBe(100)
  })

  it('동일 가격 (diffRatio = 0) → 70점 구간', () => {
    // 100*0.30 + 100*0.25 + 100*0.25 + 70*0.20 = 30 + 25 + 25 + 14 = 94
    expect(calculateExposureScore(allBest({ avgTopPrice: 10000, myPrice: 10000 }))).toBe(94)
  })

  it('3% 비쌈 (diffRatio = -0.03) → 40점 구간', () => {
    // diffRatio = (10000 - 10300) / 10000 = -0.03 → > -0.05
    // 100*0.30 + 100*0.25 + 100*0.25 + 40*0.20 = 30 + 25 + 25 + 8 = 88
    expect(calculateExposureScore(allBest({ avgTopPrice: 10000, myPrice: 10300 }))).toBe(88)
  })

  it('정확히 5% 비쌈 (diffRatio = -0.05) → 0점 구간 경계', () => {
    // diffRatio = (10000 - 10500) / 10000 = -0.05 → else 0점
    // 100*0.30 + 100*0.25 + 100*0.25 + 0*0.20 = 30 + 25 + 25 + 0 = 80
    expect(calculateExposureScore(allBest({ avgTopPrice: 10000, myPrice: 10500 }))).toBe(80)
  })

  it('10% 비쌈 (diffRatio = -0.10) → 0점 구간', () => {
    expect(calculateExposureScore(allBest({ avgTopPrice: 10000, myPrice: 11000 }))).toBe(80)
  })
})
