// =============================================
// 카테고리별 구매 가이드 콘텐츠 맵 테스트 (TDD)
//
// 공구 소모품 전문 스토어의 핵심 차별점:
// "어떤 제품을 골라야 하는지" 가이드 제공
// =============================================

import { getBuyingGuide, getBuyingGuideHtml } from './buying-guide-map'

describe('getBuyingGuide', () => {
  it('드릴비트 → 재질별 용도 가이드 반환', () => {
    const guide = getBuyingGuide('드릴비트')
    expect(guide).not.toBeNull()
    expect(guide!.title).toContain('드릴비트')
    expect(guide!.items.length).toBeGreaterThan(0)
    expect(guide!.items.some((i) => i.includes('HSS'))).toBe(true)
  })

  it('연마디스크 → 절단/연마/플랩 가이드', () => {
    const guide = getBuyingGuide('연마디스크')
    expect(guide).not.toBeNull()
    expect(guide!.items.some((i) => i.includes('절단'))).toBe(true)
  })

  it('절단날 → 이빨 수 가이드', () => {
    const guide = getBuyingGuide('절단날')
    expect(guide).not.toBeNull()
    expect(guide!.items.some((i) => i.includes('T') || i.includes('이빨'))).toBe(true)
  })

  it('그라인더 → 디스크 가이드 매칭', () => {
    const guide = getBuyingGuide('그라인더 디스크')
    expect(guide).not.toBeNull()
  })

  it('샌딩 → 샌딩페이퍼 가이드', () => {
    const guide = getBuyingGuide('샌딩페이퍼')
    expect(guide).not.toBeNull()
    expect(guide!.items.some((i) => i.includes('#') || i.includes('번'))).toBe(true)
  })

  it('알 수 없는 카테고리 → null', () => {
    const guide = getBuyingGuide('우주선부품')
    expect(guide).toBeNull()
  })

  it('부분 매칭: "HSS 드릴비트 세트" → 드릴비트 가이드', () => {
    const guide = getBuyingGuide('HSS 드릴비트 세트')
    expect(guide).not.toBeNull()
    expect(guide!.title).toContain('드릴비트')
  })

  it('대소문자 무시: "DRILL BIT" 는 매칭 안됨 (한국어만)', () => {
    const guide = getBuyingGuide('DRILL BIT')
    expect(guide).toBeNull()
  })
})

describe('getBuyingGuideHtml', () => {
  it('매칭 시 HTML 반환', () => {
    const html = getBuyingGuideHtml('드릴비트')
    expect(html).toContain('<div')
    expect(html).toContain('가이드')
    expect(html).toContain('HSS')
  })

  it('미매칭 시 빈 문자열', () => {
    const html = getBuyingGuideHtml('우주선부품')
    expect(html).toBe('')
  })
})
