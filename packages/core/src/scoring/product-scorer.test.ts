// =============================================
// 상품 스코어링 엔진 단위 테스트 (고마진 저경쟁 기준)
// calculateProductScore / SCORE_THRESHOLD
// =============================================

import { calculateProductScore, SCORE_THRESHOLD } from './product-scorer'

describe('calculateProductScore', () => {
  describe('마진율 점수 — 가중치 50%', () => {
    it('35% 이상 → 100점', () => {
      const r = calculateProductScore({ marginRate: 0.35, hasNaverCategory: false })
      expect(r.breakdown.margin).toBe(100)
    })

    it('50%(초과) → 100점 (상한 클램프)', () => {
      const r = calculateProductScore({ marginRate: 0.50, hasNaverCategory: false })
      expect(r.breakdown.margin).toBe(100)
    })

    it('25~35% 미만 → 70점', () => {
      const r25 = calculateProductScore({ marginRate: 0.25, hasNaverCategory: false })
      const r30 = calculateProductScore({ marginRate: 0.30, hasNaverCategory: false })
      expect(r25.breakdown.margin).toBe(70)
      expect(r30.breakdown.margin).toBe(70)
    })

    it('20~25% 미만 → 30점', () => {
      const r20 = calculateProductScore({ marginRate: 0.20, hasNaverCategory: false })
      const r22 = calculateProductScore({ marginRate: 0.22, hasNaverCategory: false })
      expect(r20.breakdown.margin).toBe(30)
      expect(r22.breakdown.margin).toBe(30)
    })

    it('15~20% 미만 → 0점', () => {
      const r15 = calculateProductScore({ marginRate: 0.15, hasNaverCategory: false })
      const r19 = calculateProductScore({ marginRate: 0.19, hasNaverCategory: false })
      expect(r15.breakdown.margin).toBe(0)
      expect(r19.breakdown.margin).toBe(0)
    })

    it('15% 미만 → 0점 (하한 클램프)', () => {
      const r = calculateProductScore({ marginRate: 0.05, hasNaverCategory: false })
      expect(r.breakdown.margin).toBe(0)
    })
  })

  describe('경쟁사 수 점수 — 가중치 25%', () => {
    it('0~20명 → 100점', () => {
      expect(calculateProductScore({ marginRate: 0.30, hasNaverCategory: false, competitorCount: 0 }).breakdown.competitors).toBe(100)
      expect(calculateProductScore({ marginRate: 0.30, hasNaverCategory: false, competitorCount: 10 }).breakdown.competitors).toBe(100)
      expect(calculateProductScore({ marginRate: 0.30, hasNaverCategory: false, competitorCount: 20 }).breakdown.competitors).toBe(100)
    })

    it('21~50명 → 70점', () => {
      expect(calculateProductScore({ marginRate: 0.30, hasNaverCategory: false, competitorCount: 21 }).breakdown.competitors).toBe(70)
      expect(calculateProductScore({ marginRate: 0.30, hasNaverCategory: false, competitorCount: 50 }).breakdown.competitors).toBe(70)
    })

    it('51~100명 → 40점', () => {
      expect(calculateProductScore({ marginRate: 0.30, hasNaverCategory: false, competitorCount: 51 }).breakdown.competitors).toBe(40)
      expect(calculateProductScore({ marginRate: 0.30, hasNaverCategory: false, competitorCount: 100 }).breakdown.competitors).toBe(40)
    })

    it('101명 이상 → 0점', () => {
      expect(calculateProductScore({ marginRate: 0.30, hasNaverCategory: false, competitorCount: 101 }).breakdown.competitors).toBe(0)
      expect(calculateProductScore({ marginRate: 0.30, hasNaverCategory: false, competitorCount: 500 }).breakdown.competitors).toBe(0)
    })

    it('competitorCount 미전달 → 기본값 0 → 100점', () => {
      const r = calculateProductScore({ marginRate: 0.30, hasNaverCategory: false })
      expect(r.breakdown.competitors).toBe(100)
    })
  })

  describe('가격 차이 점수 — 가중치 15%', () => {
    it('경쟁가 데이터 없음 → 중립 55점', () => {
      const r = calculateProductScore({ marginRate: 0.30, hasNaverCategory: false })
      expect(r.breakdown.priceDiff).toBe(55)
    })

    it('5% 이상 저렴 → 100점', () => {
      // diffRatio = (10000-9000)/10000 = 0.10 >= 0.05
      const r = calculateProductScore({ marginRate: 0.30, hasNaverCategory: false, ourPrice: 9000, lowestCompetitorPrice: 10000 })
      expect(r.breakdown.priceDiff).toBe(100)
    })

    it('경쟁가와 동일(0% 차이) → 70점', () => {
      const r = calculateProductScore({ marginRate: 0.30, hasNaverCategory: false, ourPrice: 10000, lowestCompetitorPrice: 10000 })
      expect(r.breakdown.priceDiff).toBe(70)
    })

    it('3% 저렴(0~5% 미만) → 70점', () => {
      // diffRatio = (10000-9700)/10000 = 0.03
      const r = calculateProductScore({ marginRate: 0.30, hasNaverCategory: false, ourPrice: 9700, lowestCompetitorPrice: 10000 })
      expect(r.breakdown.priceDiff).toBe(70)
    })

    it('3% 비쌈(0~5% 미만) → 40점', () => {
      // diffRatio = (10000-10300)/10000 = -0.03
      const r = calculateProductScore({ marginRate: 0.30, hasNaverCategory: false, ourPrice: 10300, lowestCompetitorPrice: 10000 })
      expect(r.breakdown.priceDiff).toBe(40)
    })

    it('5% 이상 비쌈 → 0점', () => {
      // diffRatio = (10000-11000)/10000 = -0.10
      const r = calculateProductScore({ marginRate: 0.30, hasNaverCategory: false, ourPrice: 11000, lowestCompetitorPrice: 10000 })
      expect(r.breakdown.priceDiff).toBe(0)
    })
  })

  describe('리뷰 수 점수 — 가중치 5%', () => {
    it('0~9개 → 30점', () => {
      expect(calculateProductScore({ marginRate: 0.30, hasNaverCategory: false, sourceReviewCount: 0 }).breakdown.reviews).toBe(30)
      expect(calculateProductScore({ marginRate: 0.30, hasNaverCategory: false, sourceReviewCount: 9 }).breakdown.reviews).toBe(30)
    })

    it('10~49개 → 70점', () => {
      expect(calculateProductScore({ marginRate: 0.30, hasNaverCategory: false, sourceReviewCount: 10 }).breakdown.reviews).toBe(70)
      expect(calculateProductScore({ marginRate: 0.30, hasNaverCategory: false, sourceReviewCount: 49 }).breakdown.reviews).toBe(70)
    })

    it('50개 이상 → 100점', () => {
      expect(calculateProductScore({ marginRate: 0.30, hasNaverCategory: false, sourceReviewCount: 50 }).breakdown.reviews).toBe(100)
      expect(calculateProductScore({ marginRate: 0.30, hasNaverCategory: false, sourceReviewCount: 200 }).breakdown.reviews).toBe(100)
    })

    it('sourceReviewCount 미전달 → 기본값 0 → 30점', () => {
      const r = calculateProductScore({ marginRate: 0.30, hasNaverCategory: false })
      expect(r.breakdown.reviews).toBe(30)
    })
  })

  describe('카테고리 점수 — 가중치 5%', () => {
    it('네이버 카테고리 있음 → 100점', () => {
      const r = calculateProductScore({ marginRate: 0.30, hasNaverCategory: true })
      expect(r.breakdown.category).toBe(100)
    })

    it('네이버 카테고리 없음 → 0점', () => {
      const r = calculateProductScore({ marginRate: 0.30, hasNaverCategory: false })
      expect(r.breakdown.category).toBe(0)
    })
  })

  describe('shouldRegister 판정 (임계값 75점)', () => {
    it('SCORE_THRESHOLD 상수는 75', () => {
      expect(SCORE_THRESHOLD).toBe(75)
    })

    it('고마진 저경쟁 상품 → shouldRegister = true', () => {
      // margin=100(35%), competitors=100(0명), priceDiff=55(데이터 없음), reviews=30(0개), category=100
      // total = 100*0.50 + 100*0.25 + 55*0.15 + 30*0.05 + 100*0.05
      //       = 50 + 25 + 8.25 + 1.5 + 5 = 89.75 → 90
      const r = calculateProductScore({ marginRate: 0.35, hasNaverCategory: true })
      expect(r.shouldRegister).toBe(true)
      expect(r.totalScore).toBeGreaterThanOrEqual(SCORE_THRESHOLD)
      expect(r.blockedReason).toBeUndefined()
    })

    it('저마진 고경쟁 상품 → shouldRegister = false + blockedReason 설정', () => {
      // margin=30(20%), competitors=0(101명), priceDiff=55(데이터 없음), reviews=30(0개), category=0
      // total = 30*0.50 + 0*0.25 + 55*0.15 + 30*0.05 + 0*0.05
      //       = 15 + 0 + 8.25 + 1.5 + 0 = 24.75 → 25
      const r = calculateProductScore({ marginRate: 0.20, hasNaverCategory: false, competitorCount: 101 })
      expect(r.shouldRegister).toBe(false)
      expect(r.totalScore).toBeLessThan(SCORE_THRESHOLD)
      expect(r.blockedReason).toContain(String(r.totalScore))
      expect(r.blockedReason).toContain(String(SCORE_THRESHOLD))
    })
  })
})
