// =============================================
// 계정별 전략 단위 테스트
// =============================================

import { getAccountStrategy } from './account-strategy'

describe('getAccountStrategy', () => {
  it('account1 → minScore:80, minMarginRate:0.35, maxCompetitors:40', () => {
    const s = getAccountStrategy('account1')
    expect(s.minScore).toBe(80)
    expect(s.minMarginRate).toBe(0.35)
    expect(s.maxCompetitors).toBe(40)
  })

  it('account2 → minScore:75, minMarginRate:0.25, maxCompetitors:80', () => {
    const s = getAccountStrategy('account2')
    expect(s.minScore).toBe(75)
    expect(s.minMarginRate).toBe(0.25)
    expect(s.maxCompetitors).toBe(80)
  })

  it('account3 → minScore:70, minMarginRate:0.20, maxCompetitors:120', () => {
    const s = getAccountStrategy('account3')
    expect(s.minScore).toBe(70)
    expect(s.minMarginRate).toBe(0.20)
    expect(s.maxCompetitors).toBe(120)
  })

  it('account4 → minScore:78, minMarginRate:0.30, maxCompetitors:60', () => {
    const s = getAccountStrategy('account4')
    expect(s.minScore).toBe(78)
    expect(s.minMarginRate).toBe(0.30)
    expect(s.maxCompetitors).toBe(60)
  })

  it('미등록 accountId → default 전략(75/0.25/80)', () => {
    const s = getAccountStrategy('unknown-account')
    expect(s.minScore).toBe(75)
    expect(s.minMarginRate).toBe(0.25)
    expect(s.maxCompetitors).toBe(80)
  })

  it('default 계정도 default 전략 반환', () => {
    const s = getAccountStrategy('default')
    expect(s.minScore).toBe(75)
    expect(s.minMarginRate).toBe(0.25)
    expect(s.maxCompetitors).toBe(80)
  })
})
