// =============================================
// 원산지 기반 차등 마진 테스트 (TDD — Phase B-2)
//
// 국산 프리미엄, 중국산 경쟁가
// =============================================

import { getOriginMarginAdjustment } from './origin-margin'

describe('getOriginMarginAdjustment', () => {
  it('국산(한국) → +5% 프리미엄', () => {
    expect(getOriginMarginAdjustment('대한민국')).toBe(0.05)
  })

  it('한국 → +5%', () => {
    expect(getOriginMarginAdjustment('한국')).toBe(0.05)
  })

  it('Korea → +5%', () => {
    expect(getOriginMarginAdjustment('Korea')).toBe(0.05)
  })

  it('일본 → +3% (품질 인식)', () => {
    expect(getOriginMarginAdjustment('일본')).toBe(0.03)
  })

  it('독일 → +3% (공구 강국)', () => {
    expect(getOriginMarginAdjustment('독일')).toBe(0.03)
  })

  it('미국 → +3%', () => {
    expect(getOriginMarginAdjustment('미국')).toBe(0.03)
  })

  it('중국 → -3% (경쟁가)', () => {
    expect(getOriginMarginAdjustment('중국')).toBe(-0.03)
  })

  it('대만 → 0% (중립)', () => {
    expect(getOriginMarginAdjustment('대만')).toBe(0)
  })

  it('null/undefined → 0%', () => {
    expect(getOriginMarginAdjustment(null)).toBe(0)
    expect(getOriginMarginAdjustment(undefined)).toBe(0)
  })

  it('빈 문자열 → 0%', () => {
    expect(getOriginMarginAdjustment('')).toBe(0)
  })

  it('해당없음 → 0%', () => {
    expect(getOriginMarginAdjustment('해당없음')).toBe(0)
  })
})
