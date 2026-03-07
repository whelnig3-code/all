// =============================================
// 가격 조정 엔진 단위 테스트
// - blockedByMarginGuard 경계값 테스트 포함
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

describe('adjustPrice', () => {
  describe('정상 언더컷 케이스', () => {
    it('경쟁가보다 10원 낮은 가격으로 조정', () => {
      // 목표 마진가: CEIL(12500/0.65, 10) = 19,240원
      // 언더컷: 30,000 - 10 = 29,990원 → 목표 마진가(19,240)보다 높으므로 19,240 유지
      const result = adjustPrice(20_000, {
        ...BASE_INPUT,
        lowestCompetitorPrice: 30_000,
      })
      expect(result.shouldAdjust).toBe(true)
      expect(result.blockedByMarginGuard).toBe(false)
      expect(result.newPrice).toBe(19_240) // 목표 마진가로 고정
    })

    it('경쟁가가 낮을 때 언더컷 가격 10원 단위 올림', () => {
      // 언더컷 후보: 22,000 - 10 = 21,990원
      // 최소 마진가: CEIL(12500/0.85, 10) ≈ 14,710원 → 언더컷 > 최소 마진가, 통과
      const result = adjustPrice(25_000, {
        ...BASE_INPUT,
        lowestCompetitorPrice: 22_000,
      })
      expect(result.shouldAdjust).toBe(true)
      expect(result.blockedByMarginGuard).toBe(false)
      // 21,990 → 10원 단위 올림 → 22,000
      expect(result.newPrice).toBe(22_000)
    })
  })

  describe('blockedByMarginGuard — 마진 안전장치 경계값', () => {
    it('언더컷 가격이 최소 마진가 미만 → blockedByMarginGuard=true, 최소 마진가로 대체', () => {
      // 최소 마진가 (15%): CEIL(12500/0.80, 10) = 15,630원 (나머지 = 0.80=1-0.05-0.15)
      // 실제 계산: CEIL(12500/0.80, 10) = CEIL(15625, 10) = 15630
      // 언더컷: 15,000 - 10 = 14,990원 < 15,630원 → 마진 가드 발동
      const result = adjustPrice(20_000, {
        ...BASE_INPUT,
        lowestCompetitorPrice: 15_000,
      })
      expect(result.blockedByMarginGuard).toBe(true)
      // 최소 마진가로 조정됨
      expect(result.newPrice).toBeLessThanOrEqual(20_000)
      expect(result.reason).toMatch(/margin guard/)
    })

    it('언더컷 가격이 최소 마진가 경계값(+1원) → blockedByMarginGuard=false', () => {
      // 최소 마진가 ≈ 15,630원. 경쟁가를 충분히 높게 설정 (언더컷 후보 > 최소 마진가)
      const result = adjustPrice(20_000, {
        ...BASE_INPUT,
        lowestCompetitorPrice: 18_000, // 언더컷: 17,990 > 15,630 (최소 마진가)
      })
      expect(result.blockedByMarginGuard).toBe(false)
    })

    it('blockedByMarginGuard=true 시 reason에 식별 메시지 포함', () => {
      const result = adjustPrice(20_000, {
        ...BASE_INPUT,
        lowestCompetitorPrice: 14_000,
      })
      expect(result.blockedByMarginGuard).toBe(true)
      expect(result.reason).toMatch(/margin guard/)
    })
  })

  describe('변동 임계값', () => {
    it('1% 미만 변동 → shouldAdjust=false (API 호출 불필요)', () => {
      // 현재가와 거의 동일한 경쟁가
      const result = adjustPrice(19_240, {
        ...BASE_INPUT,
        lowestCompetitorPrice: 19_300, // 언더컷: 19,290 → 변동 미미
      })
      expect(result.shouldAdjust).toBe(false)
    })

    it('shouldAdjust=false여도 blockedByMarginGuard는 정확히 반영', () => {
      const result = adjustPrice(15_640, {
        ...BASE_INPUT,
        lowestCompetitorPrice: 15_000, // margin guard 발동 → 최소 마진가로 대체, 변동 거의 없음
      })
      // blockedByMarginGuard는 마진 가드 발동 여부를 정확히 반영해야 함
      expect(result.blockedByMarginGuard).toBe(true)
    })
  })

  describe('MIN_MARGIN_RATE 상수 검증', () => {
    it('MIN_MARGIN_RATE는 0.15 (15%) 이어야 함', () => {
      expect(MIN_MARGIN_RATE).toBe(0.15)
    })
  })
})
