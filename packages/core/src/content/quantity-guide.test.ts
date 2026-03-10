// =============================================
// 수량 가이드 + 안전 경고 테스트 (TDD)
//
// 마케팅 검증: 수량 가이드가 있으면 객단가 상승
// "4인치 절단석, 철재 기준 1매 약 30분 → 월 24매 소모 → 50매 세트 추천"
// =============================================

import { generateQuantityGuide, generateSafetyWarning } from './quantity-guide'

describe('generateQuantityGuide', () => {
  it('그라인더 디스크 → 소모량 + 세트 추천', () => {
    const html = generateQuantityGuide('그라인더 디스크')
    expect(html).toContain('매')
    expect(html).toContain('추천')
  })

  it('드릴비트 → 사용 수명 안내', () => {
    const html = generateQuantityGuide('드릴비트')
    expect(html).toContain('교체')
  })

  it('샌딩페이퍼 → 소모량 안내', () => {
    const html = generateQuantityGuide('샌딩페이퍼')
    expect(html).not.toBe('')
  })

  it('알 수 없는 카테고리 → 빈 문자열', () => {
    const html = generateQuantityGuide('우주선부품')
    expect(html).toBe('')
  })

  it('HTML div로 래핑', () => {
    const html = generateQuantityGuide('그라인더 디스크')
    expect(html).toMatch(/^<div/)
  })
})

describe('generateSafetyWarning', () => {
  it('그라인더/절단석 → 회전수 경고', () => {
    const html = generateSafetyWarning('그라인더 절단석')
    expect(html).toContain('회전')
    expect(html).toContain('주의')
  })

  it('드릴비트 → 안전장비 착용 안내', () => {
    const html = generateSafetyWarning('드릴비트')
    expect(html).toContain('보안경') // 보호 안경
  })

  it('측정기구 → 빈 문자열 (위험 없음)', () => {
    const html = generateSafetyWarning('줄자')
    expect(html).toBe('')
  })

  it('경고 포함 시 경고 아이콘/스타일', () => {
    const html = generateSafetyWarning('그라인더')
    expect(html).toContain('주의')
    expect(html).toContain('<div')
  })
})
