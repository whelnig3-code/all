// =============================================
// 가격 조정 엔진 단위 테스트
// - blockedByMarginGuard 경계값 테스트 포함
// - 심리가격 적용: 만원 경계에서만 -100원
// =============================================
import { adjustPrice } from './price-adjuster'
import { MIN_MARGIN_RATE } from '../safety/guards'

/** 기본 입력값 (공통) */
const BASE_INPUT = {
  wholesalePrice: 10_000,
  shippingFee: 2_500,
  naverFeeRate: 0.05,
  targetMarginRate: 0.30,
}

// 기준 가격 메모:
// 목표 마진가(30%): toPsychPrice(12500/0.65) = toPsychPrice(19230.77) = 19,900원 (만원 경계)
// 최소 마진가(10%): toPsychPrice(12500/0.85) = toPsychPrice(14705.88) = 15,000원 (경계 아님)

describe('adjustPrice', () => {
  describe('정상 언더컷 케이스', () => {
    it('경쟁가가 현재가보다 높으면 목표 마진가(19,900)로 수익 극대화', () => {
      const result = adjustPrice(25_000, {
        ...BASE_INPUT,
        lowestCompetitorPrice: 30_000,
      })
      expect(result.shouldAdjust).toBe(true)
      expect(result.blockedByMarginGuard).toBe(false)
      expect(result.newPrice).toBe(19_900)
    })

    it('경쟁가가 낮을 때 언더컷 가격에 심리가격 적용', () => {
      // 언더컷: 22,000 - 10 = 21,990 → toPsychPrice(21,991) = ceil(22,000) → 경계 아님 → 22,000
      const result = adjustPrice(25_000, {
        ...BASE_INPUT,
        lowestCompetitorPrice: 22_000,
      })
      expect(result.shouldAdjust).toBe(true)
      expect(result.blockedByMarginGuard).toBe(false)
      expect(result.newPrice).toBe(22_000)
    })
  })

  describe('blockedByMarginGuard — 마진 안전장치 경계값', () => {
    it('언더컷 가격이 최소 마진가 미만 → blockedByMarginGuard=true, 최소 마진가(15,000)로 대체', () => {
      // 최소 마진가(10%): 15,000원
      // 언더컷: 14,000 - 10 = 13,990 < 15,000 → 마진 가드 발동
      const result = adjustPrice(20_000, {
        ...BASE_INPUT,
        lowestCompetitorPrice: 14_000,
      })
      expect(result.blockedByMarginGuard).toBe(true)
      expect(result.newPrice).toBe(15_000)
      expect(result.reason).toMatch(/margin guard/)
    })

    it('언더컷 가격이 최소 마진가 이상 → blockedByMarginGuard=false', () => {
      const result = adjustPrice(20_000, {
        ...BASE_INPUT,
        lowestCompetitorPrice: 18_000, // 언더컷: 17,990 > 15,000
      })
      expect(result.blockedByMarginGuard).toBe(false)
    })

    it('blockedByMarginGuard=true 시 reason에 식별 메시지 포함', () => {
      const result = adjustPrice(20_000, {
        ...BASE_INPUT,
        lowestCompetitorPrice: 13_000,
      })
      expect(result.blockedByMarginGuard).toBe(true)
      expect(result.reason).toMatch(/margin guard/)
    })
  })

  describe('변동 임계값', () => {
    it('1% 미만 변동 → shouldAdjust=false', () => {
      // 목표 마진가 19,900. 현재가를 19,900에 맞추면 변동 0%
      const result = adjustPrice(19_900, {
        ...BASE_INPUT,
        lowestCompetitorPrice: 30_000,
      })
      expect(result.shouldAdjust).toBe(false)
    })

    it('shouldAdjust=false여도 blockedByMarginGuard는 정확히 반영', () => {
      // 최소 마진가(10%) 15,000. 현재가를 15,000에 맞추면 변동 0%
      const result = adjustPrice(15_000, {
        ...BASE_INPUT,
        lowestCompetitorPrice: 14_000,
      })
      expect(result.shouldAdjust).toBe(false)
      expect(result.blockedByMarginGuard).toBe(true)
    })
  })

  describe('MIN_MARGIN_RATE 상수 검증', () => {
    it('MIN_MARGIN_RATE는 0.10 (10%) 이어야 함 (absolute floor, tiered-margin이 가격대별 동적 마진 담당)', () => {
      expect(MIN_MARGIN_RATE).toBe(0.10)
    })
  })
})
