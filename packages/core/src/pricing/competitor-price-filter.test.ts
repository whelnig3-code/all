// =============================================
// 경쟁가 이상치 필터 테스트 (TDD)
// =============================================

import { filterCompetitorPrices } from './competitor-price-filter'

describe('filterCompetitorPrices', () => {
  describe('기본 케이스', () => {
    it('빈 배열 → 빈 결과', () => {
      const result = filterCompetitorPrices([])
      expect(result.filtered).toEqual([])
      expect(result.removed).toEqual([])
      expect(result.median).toBe(0)
    })

    it('단일 항목 → 그대로 반환', () => {
      const result = filterCompetitorPrices([{ price: 10000, name: 'A' }])
      expect(result.filtered).toEqual([{ price: 10000, name: 'A' }])
      expect(result.removed).toEqual([])
      expect(result.median).toBe(10000)
    })

    it('2개 항목 → 중위가는 평균', () => {
      const result = filterCompetitorPrices([
        { price: 8000 },
        { price: 12000 },
      ])
      expect(result.median).toBe(10000)
      expect(result.filtered).toHaveLength(2)
    })
  })

  describe('이상치 제거', () => {
    it('극단적으로 싼 이상치 제거 (중위가의 50% 미만)', () => {
      // 중위가 10,000. 50% = 5,000. 200% = 20,000
      const result = filterCompetitorPrices([
        { price: 27, name: '마스크(오분류)' },     // 극단 이상치
        { price: 8000, name: '정상1' },
        { price: 10000, name: '정상2' },
        { price: 12000, name: '정상3' },
        { price: 15000, name: '정상4' },
      ])
      expect(result.filtered).toHaveLength(4)
      expect(result.removed).toHaveLength(1)
      expect(result.removed[0].name).toBe('마스크(오분류)')
    })

    it('극단적으로 비싼 이상치 제거 (중위가의 200% 초과)', () => {
      // 중위가 10,000. 200% = 20,000
      const result = filterCompetitorPrices([
        { price: 8000 },
        { price: 10000 },
        { price: 12000 },
        { price: 652000, name: '디월트 임팩(오분류)' },
      ])
      expect(result.removed).toHaveLength(1)
      expect(result.removed[0].name).toBe('디월트 임팩(오분류)')
    })

    it('양쪽 이상치 동시 제거', () => {
      const result = filterCompetitorPrices([
        { price: 100 },    // 너무 싸
        { price: 5000 },
        { price: 8000 },
        { price: 10000 },
        { price: 12000 },
        { price: 500000 }, // 너무 비싸
      ])
      // 중위가: (8000+10000)/2 = 9000
      // 범위: 4500 ~ 18000
      expect(result.median).toBe(9000)
      expect(result.filtered).toHaveLength(4) // 5000, 8000, 10000, 12000
      expect(result.removed).toHaveLength(2)  // 100, 500000
    })
  })

  describe('정상 범위', () => {
    it('모두 범위 내 → 제거 없음', () => {
      const result = filterCompetitorPrices([
        { price: 7000 },
        { price: 8000 },
        { price: 9000 },
        { price: 10000 },
        { price: 11000 },
      ])
      expect(result.filtered).toHaveLength(5)
      expect(result.removed).toHaveLength(0)
    })

    it('경계값: 정확히 50% = 포함', () => {
      // 중위가 10000. 50% = 5000
      const result = filterCompetitorPrices([
        { price: 5000 },   // 정확히 50%
        { price: 10000 },
        { price: 10000 },
      ])
      expect(result.filtered).toHaveLength(3)
    })

    it('경계값: 정확히 200% = 포함', () => {
      // 중위가 10000. 200% = 20000
      const result = filterCompetitorPrices([
        { price: 10000 },
        { price: 10000 },
        { price: 20000 },  // 정확히 200%
      ])
      expect(result.filtered).toHaveLength(3)
    })
  })

  describe('커스텀 범위', () => {
    it('좁은 범위 (70~150%)', () => {
      const result = filterCompetitorPrices(
        [
          { price: 5000 },
          { price: 8000 },
          { price: 10000 },
          { price: 12000 },
          { price: 20000 },
        ],
        { lowerRatio: 0.7, upperRatio: 1.5 },
      )
      // 중위가 10000. 70%=7000, 150%=15000
      expect(result.filtered).toHaveLength(3) // 8000, 10000, 12000
      expect(result.removed).toHaveLength(2)  // 5000, 20000
    })
  })

  describe('실제 데이터 시뮬레이션', () => {
    it('블랙박스 검색 (4074배 편차) → 정상 범위만 남김', () => {
      const result = filterCompetitorPrices([
        { price: 27, name: '마스크' },
        { price: 300, name: '고무링' },
        { price: 3900, name: '블랙박스A' },
        { price: 45000, name: '블랙박스B' },
        { price: 110000, name: '전기테이프' },
      ])
      // 중위가 3,900. 범위: 1,950 ~ 7,800
      expect(result.median).toBe(3900)
      expect(result.filtered.map((p) => p.name)).toEqual(['블랙박스A'])
      expect(result.removed).toHaveLength(4)
    })

    it('토크렌치 검색 (1087배 편차)', () => {
      const result = filterCompetitorPrices([
        { price: 600 },
        { price: 5000 },
        { price: 8000 },
        { price: 12000 },
        { price: 652260 },
      ])
      // 중위가 8000. 범위: 4000 ~ 16000
      expect(result.filtered.map((p) => p.price)).toEqual([5000, 8000, 12000])
      expect(result.removed).toHaveLength(2)
    })
  })

  describe('불변성', () => {
    it('원본 배열을 변경하지 않음', () => {
      const original = [{ price: 100 }, { price: 10000 }, { price: 12000 }]
      const copy = JSON.parse(JSON.stringify(original))
      filterCompetitorPrices(original)
      expect(original).toEqual(copy)
    })
  })
})
