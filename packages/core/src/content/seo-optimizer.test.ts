// =============================================
// 네이버 SEO 최적화 테스트 (TDD — Phase C-2)
//
// 상품명을 검색 키워드 + 스펙 조합으로 최적화
// =============================================

import { optimizeProductTitle, generateSearchTags } from './seo-optimizer'

describe('optimizeProductTitle', () => {
  it('핵심 키워드 + 스펙 조합', () => {
    const result = optimizeProductTitle({
      originalName: '[무료배송] HSS 드릴비트 세트 13본 6mm 코발트',
      category: '공구',
    })
    expect(result).toContain('드릴비트')
    expect(result).toContain('세트')
    expect(result.length).toBeLessThanOrEqual(100)
  })

  it('노이즈 제거 ([무료배송], 특가 등)', () => {
    const result = optimizeProductTitle({
      originalName: '[무료배송] 【특가】 드릴비트 세트 ★최저가★',
      category: '공구',
    })
    expect(result).not.toContain('무료배송')
    expect(result).not.toContain('특가')
    expect(result).not.toContain('최저가')
  })

  it('100자 제한', () => {
    const longName = '아주 긴 상품명 '.repeat(20)
    const result = optimizeProductTitle({
      originalName: longName,
      category: '공구',
    })
    expect(result.length).toBeLessThanOrEqual(100)
  })

  it('빈 문자열 → 빈 문자열', () => {
    expect(optimizeProductTitle({ originalName: '', category: '' })).toBe('')
  })
})

describe('generateSearchTags', () => {
  it('상품명에서 태그 추출', () => {
    const tags = generateSearchTags('HSS 드릴비트 6mm 코발트 세트')
    expect(tags).toContain('드릴비트')
    expect(tags).toContain('HSS')
    expect(tags.length).toBeGreaterThan(0)
  })

  it('최대 10개 태그', () => {
    const tags = generateSearchTags('a b c d e f g h i j k l m n o')
    expect(tags.length).toBeLessThanOrEqual(10)
  })

  it('중복 제거', () => {
    const tags = generateSearchTags('드릴비트 드릴비트 드릴비트')
    const unique = [...new Set(tags)]
    expect(tags.length).toBe(unique.length)
  })

  it('1글자 태그 제외', () => {
    const tags = generateSearchTags('A 드릴비트 B 세트')
    expect(tags.every((t) => t.length > 1)).toBe(true)
  })
})
