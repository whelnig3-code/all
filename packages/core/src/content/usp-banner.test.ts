// =============================================
// USP 배너 시스템 테스트 (TDD)
//
// 모든 상품 최상단에 "왜 여기서 사야 하는지" 배너 삽입
// 부스트 모드: 리뷰 유도 + 첫 구매 혜택 추가
// =============================================

import { generateUspBanner } from './usp-banner'

describe('generateUspBanner', () => {
  describe('기본 모드', () => {
    it('4가지 USP 포인트가 모두 포함됨', () => {
      const html = generateUspBanner()
      expect(html).toContain('규격')
      expect(html).toContain('당일')
      expect(html).toContain('KC')
      expect(html).toContain('규격표')
    })

    it('HTML div로 래핑됨', () => {
      const html = generateUspBanner()
      expect(html).toMatch(/^<div/)
      expect(html).toMatch(/<\/div>$/)
    })

    it('부스트 요소는 포함되지 않음', () => {
      const html = generateUspBanner()
      expect(html).not.toContain('첫 구매')
      expect(html).not.toContain('리뷰')
    })
  })

  describe('부스트 모드', () => {
    it('기본 USP + 리뷰 적립금 문구 포함', () => {
      const html = generateUspBanner({ boostMode: true })
      expect(html).toContain('규격')
      expect(html).toContain('리뷰')
    })

    it('첫 구매 혜택 배너 포함', () => {
      const html = generateUspBanner({ boostMode: true })
      expect(html).toContain('첫 구매')
    })
  })

  describe('카테고리별 분기', () => {
    it('공구 카테고리 → 규격 불일치 무료반품 강조', () => {
      const html = generateUspBanner({ category: '공구' })
      expect(html).toContain('불일치')
      expect(html).toContain('무료')
    })

    it('측정 카테고리 → 정확도 보장 강조', () => {
      const html = generateUspBanner({ category: '측정' })
      expect(html).toContain('정확')
    })

    it('알 수 없는 카테고리 → 기본 배너', () => {
      const html = generateUspBanner({ category: '기타잡화' })
      expect(html).toContain('규격')
      expect(html).not.toContain('불일치')
    })
  })

  describe('규격 보장 배너', () => {
    it('무료반품 보장 문구 포함', () => {
      const html = generateUspBanner({ category: '공구' })
      expect(html).toContain('반품')
    })
  })
})
