// =============================================
// FAQ 자동 생성 테스트 (TDD)
//
// 카테고리 + 스펙 기반 사전 정의 FAQ
// =============================================

import { generateFaqHtml } from './faq-generator'

describe('generateFaqHtml', () => {
  it('드릴비트 → 호환/재질/구성 FAQ', () => {
    const html = generateFaqHtml({ category: '드릴비트' })
    expect(html).toContain('드릴')
    expect(html).toContain('?')
  })

  it('그라인더 디스크 → 규격/용도 FAQ', () => {
    const html = generateFaqHtml({ category: '그라인더 디스크' })
    expect(html).toContain('?')
  })

  it('스펙 포함 시 스펙 관련 FAQ 추가', () => {
    const html = generateFaqHtml({
      category: '드릴비트',
      specs: [['재질', 'HSS'], ['직경', '6mm']],
    })
    expect(html).toContain('HSS')
  })

  it('알 수 없는 카테고리 → 기본 FAQ', () => {
    const html = generateFaqHtml({ category: '알수없음' })
    expect(html).toContain('배송')
    expect(html).toContain('?')
  })

  it('HTML 구조: 질문 + 답변 쌍', () => {
    const html = generateFaqHtml({ category: '드릴비트' })
    expect(html).toContain('<div')
    expect(html).toContain('Q.')
    expect(html).toContain('A.')
  })

  it('빈 카테고리 → 기본 FAQ', () => {
    const html = generateFaqHtml({})
    expect(html).toContain('배송')
  })
})
