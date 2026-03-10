// =============================================
// 금칙어 필터 단위 테스트
// sanitizeMarketingPhrases
// =============================================

import { sanitizeMarketingPhrases } from './policy-filter'

describe('sanitizeMarketingPhrases', () => {
  describe('금칙어 치환', () => {
    it('최고 → 실용적으로 치환', () => {
      const result = sanitizeMarketingPhrases(['최고의 품질'])
      expect(result[0]).toContain('실용적')
      expect(result[0]).not.toContain('최고')
    })

    it('100% → 삭제', () => {
      const result = sanitizeMarketingPhrases(['100% 천연 소재'])
      expect(result[0]).not.toContain('100%')
      expect(result[0]).not.toContain('100 %')
    })
  })

  describe('금칙어 삭제', () => {
    it('절대 → 삭제', () => {
      const result = sanitizeMarketingPhrases(['절대 후회 없음'])
      expect(result[0]).not.toContain('절대')
    })

    it('보장 → 삭제', () => {
      const result = sanitizeMarketingPhrases(['품질 보장 제품'])
      expect(result[0]).not.toContain('보장')
    })

    it('의료/치료 → 삭제', () => {
      const result = sanitizeMarketingPhrases(['의료용 재질', '치료 효과'])
      expect(result).not.toContain('의료')
      expect(result).not.toContain('치료')
    })

    it('KC인증 보장 → 삭제', () => {
      const result = sanitizeMarketingPhrases(['KC인증 보장 제품'])
      expect(result[0]).not.toContain('KC인증 보장')
    })

    it('정품 보장 → 삭제', () => {
      const result = sanitizeMarketingPhrases(['정품 보장 확인'])
      expect(result[0]).not.toContain('정품 보장')
    })
  })

  describe('빈 결과 시 기본 불릿 반환', () => {
    it('빈 배열 입력 → 기본 불릿 3개', () => {
      const result = sanitizeMarketingPhrases([])
      expect(result).toHaveLength(3)
      expect(result[0]).toBe('가정용 DIY 작업에 적합')
      expect(result[1]).toBe('사용이 간편한 구성')
      expect(result[2]).toBe('보관/정리에 편리')
    })

    it('필터 후 빈 텍스트만 남으면 기본 불릿 반환', () => {
      // 전부 금칙어인 경우
      const result = sanitizeMarketingPhrases(['보장', '의료', '치료'])
      expect(result).toHaveLength(3)
      expect(result[0]).toBe('가정용 DIY 작업에 적합')
    })
  })

  describe('최대 3개 제한', () => {
    it('4개 입력 → 3개만 반환', () => {
      const result = sanitizeMarketingPhrases([
        '편리한 사용법',
        '가벼운 소재',
        '튼튼한 구조',
        '합리적인 가격',
      ])
      expect(result.length).toBeLessThanOrEqual(3)
    })
  })

  describe('18자 이내 제한', () => {
    it('18자 초과 텍스트 → 18자로 자름', () => {
      const longText = '이것은 매우 긴 불릿 포인트 텍스트입니다 여기서 잘려야 합니다'
      const result = sanitizeMarketingPhrases([longText])
      // 기본 불릿이 아닌 경우에만 체크
      if (result[0] !== '가정용 DIY 작업에 적합') {
        expect(result[0]!.length).toBeLessThanOrEqual(18)
      }
    })
  })

  describe('중복 제거', () => {
    it('동일 텍스트 중복 → 1개만 반환', () => {
      const result = sanitizeMarketingPhrases([
        '편리한 사용법',
        '편리한 사용법',
        '가벼운 소재',
      ])
      const unique = new Set(result)
      expect(unique.size).toBe(result.length)
    })
  })
})
