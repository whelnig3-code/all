// =============================================
// 계정별 카테고리 전략 테스트 (TDD — RED first)
//
// 비유: 각 매장(계정)이 취급하는 코너(카테고리)를 정한다.
// 전동공구 전문점은 전동공구만, 생활용품점은 생활도구만.
// 물건이 들어오면 해당 매장 코너에 맞는지 확인 후 진열한다.
// =============================================

import {
  getAccountCategories,
  isProductAllowedForAccount,
  setAccountCategories,
  ACCOUNT_CATEGORY_MAP,
} from './account-category'

describe('ACCOUNT_CATEGORY_MAP', () => {
  it('기본 계정 설정이 존재함', () => {
    expect(Object.keys(ACCOUNT_CATEGORY_MAP).length).toBeGreaterThan(0)
  })
})

describe('getAccountCategories', () => {
  it('등록된 계정 → 해당 카테고리 그룹 반환', () => {
    // account1은 전동공구 소모품 + 수동공구 전문
    const groups = getAccountCategories('account1')
    expect(groups).toContain('전동공구 소모품')
    expect(groups).toContain('수동공구')
  })

  it('미등록 계정 → 전체 카테고리 허용 (빈 배열 = 제한 없음)', () => {
    const groups = getAccountCategories('unknown-account')
    expect(groups).toEqual([])
  })

  it('default 계정 → 전체 카테고리 허용', () => {
    const groups = getAccountCategories('default')
    expect(groups).toEqual([])
  })
})

describe('isProductAllowedForAccount', () => {
  it('account1(전동공구+수동공구) + 드릴비트 → 허용', () => {
    const result = isProductAllowedForAccount({
      accountId: 'account1',
      productName: 'HSS 드릴비트 13본 세트',
    })
    expect(result.allowed).toBe(true)
    expect(result.category).toBe('드릴비트')
    expect(result.group).toBe('전동공구 소모품')
  })

  it('account1(전동공구+수동공구) + 원예가위 → 거부', () => {
    const result = isProductAllowedForAccount({
      accountId: 'account1',
      productName: '전지가위 원예 가지치기',
    })
    expect(result.allowed).toBe(false)
    expect(result.group).toBe('원예/농업')
    expect(result.reason).toContain('카테고리')
  })

  it('account2(생활도구+원예) + 글루건 → 허용', () => {
    const result = isProductAllowedForAccount({
      accountId: 'account2',
      productName: '글루건 대형 접착제',
    })
    expect(result.allowed).toBe(true)
    expect(result.group).toBe('생활도구')
  })

  it('account2(생활도구+원예) + 드릴비트 → 거부', () => {
    const result = isProductAllowedForAccount({
      accountId: 'account2',
      productName: 'HSS 드릴비트 세트',
    })
    expect(result.allowed).toBe(false)
    expect(result.group).toBe('전동공구 소모품')
  })

  it('미등록 계정 → 모든 상품 허용 (제한 없음)', () => {
    const result = isProductAllowedForAccount({
      accountId: 'unknown',
      productName: '아무 상품이나',
    })
    expect(result.allowed).toBe(true)
  })

  it('기타 카테고리 상품 → 허용 (분류 불가 상품은 통과)', () => {
    const result = isProductAllowedForAccount({
      accountId: 'account1',
      productName: '우주선 부품 특수',
    })
    expect(result.allowed).toBe(true)
    expect(result.category).toBe('기타')
  })
})

describe('setAccountCategories', () => {
  it('런타임에 계정 카테고리 설정 변경', () => {
    setAccountCategories('test-account', ['배관/설비', '전기/조명'])
    const groups = getAccountCategories('test-account')
    expect(groups).toEqual(['배관/설비', '전기/조명'])

    // 배관 상품 → 허용
    const result1 = isProductAllowedForAccount({
      accountId: 'test-account',
      productName: '배관 파이프 피팅',
    })
    expect(result1.allowed).toBe(true)

    // 드릴비트 → 거부
    const result2 = isProductAllowedForAccount({
      accountId: 'test-account',
      productName: '드릴비트 세트',
    })
    expect(result2.allowed).toBe(false)
  })

  it('빈 배열 설정 → 제한 해제 (모든 카테고리 허용)', () => {
    setAccountCategories('test-account2', [])
    const result = isProductAllowedForAccount({
      accountId: 'test-account2',
      productName: '드릴비트 세트',
    })
    expect(result.allowed).toBe(true)
  })
})
