// =============================================
// 가격 변동 안전장치 테스트 (TDD — Phase A-2)
//
// 급격한 가격 변동 방지:
//   - 1회 최대 -10% 하락 제한
//   - 1일 최대 2회 변동 제한
//   - dry-run 모드 지원
// =============================================

import {
  isPriceChangeAllowed,
  type PriceChangeInput,
  type PriceChangeResult,
} from './price-change-guard'

describe('isPriceChangeAllowed', () => {
  describe('정상 변동', () => {
    it('5% 하락 → 허용', () => {
      const result = isPriceChangeAllowed({
        currentPrice: 20000,
        newPrice: 19000,
        changesLast24h: 0,
      })
      expect(result.allowed).toBe(true)
    })

    it('가격 상승 → 항상 허용', () => {
      const result = isPriceChangeAllowed({
        currentPrice: 20000,
        newPrice: 22000,
        changesLast24h: 0,
      })
      expect(result.allowed).toBe(true)
    })

    it('1% 하락 → 허용', () => {
      const result = isPriceChangeAllowed({
        currentPrice: 20000,
        newPrice: 19800,
        changesLast24h: 0,
      })
      expect(result.allowed).toBe(true)
    })
  })

  describe('과도한 하락 차단', () => {
    it('15% 하락 → 차단 (최대 10%)', () => {
      const result = isPriceChangeAllowed({
        currentPrice: 20000,
        newPrice: 17000,
        changesLast24h: 0,
      })
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('10%')
    })

    it('정확히 10% 하락 → 허용 (경계값)', () => {
      const result = isPriceChangeAllowed({
        currentPrice: 20000,
        newPrice: 18000,
        changesLast24h: 0,
      })
      expect(result.allowed).toBe(true)
    })

    it('10.1% 하락 → 차단', () => {
      const result = isPriceChangeAllowed({
        currentPrice: 20000,
        newPrice: 17980,
        changesLast24h: 0,
      })
      expect(result.allowed).toBe(false)
    })
  })

  describe('일일 변동 횟수 제한', () => {
    it('당일 0회 → 허용', () => {
      const result = isPriceChangeAllowed({
        currentPrice: 20000,
        newPrice: 19000,
        changesLast24h: 0,
      })
      expect(result.allowed).toBe(true)
    })

    it('당일 1회 → 허용', () => {
      const result = isPriceChangeAllowed({
        currentPrice: 20000,
        newPrice: 19000,
        changesLast24h: 1,
      })
      expect(result.allowed).toBe(true)
    })

    it('당일 2회 → 차단 (최대 2회)', () => {
      const result = isPriceChangeAllowed({
        currentPrice: 20000,
        newPrice: 19000,
        changesLast24h: 2,
      })
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('2회')
    })
  })

  describe('dry-run 모드', () => {
    it('dry-run → allowed=false, dryRun=true', () => {
      const result = isPriceChangeAllowed({
        currentPrice: 20000,
        newPrice: 19000,
        changesLast24h: 0,
        dryRun: true,
      })
      expect(result.allowed).toBe(false)
      expect(result.dryRun).toBe(true)
      expect(result.wouldAllow).toBe(true)
    })

    it('dry-run + 과도한 하락 → wouldAllow=false', () => {
      const result = isPriceChangeAllowed({
        currentPrice: 20000,
        newPrice: 15000,
        changesLast24h: 0,
        dryRun: true,
      })
      expect(result.dryRun).toBe(true)
      expect(result.wouldAllow).toBe(false)
    })
  })

  describe('커스텀 설정', () => {
    it('최대 하락 5%로 설정', () => {
      const result = isPriceChangeAllowed({
        currentPrice: 20000,
        newPrice: 18500,
        changesLast24h: 0,
        maxDropRate: 0.05,
      })
      expect(result.allowed).toBe(false)
    })

    it('일일 최대 5회로 설정', () => {
      const result = isPriceChangeAllowed({
        currentPrice: 20000,
        newPrice: 19000,
        changesLast24h: 4,
        maxChangesPerDay: 5,
      })
      expect(result.allowed).toBe(true)
    })
  })
})
