// =============================================
// 상품 중복 차단 유틸리티 단위 테스트
// =============================================

import { buildProductUniqueKey, assertProductUniqueKey } from './deduplication'

describe('buildProductUniqueKey', () => {
  it('source:sourceProductId 형식으로 반환', () => {
    expect(buildProductUniqueKey('domaegguk', '12345')).toBe('domaegguk:12345')
  })

  it('ownerclan 공급처 키 생성', () => {
    expect(buildProductUniqueKey('ownerclan', 'oc-999')).toBe('ownerclan:oc-999')
  })

  it('동일 입력 → 항상 동일한 키 (결정적)', () => {
    const key1 = buildProductUniqueKey('domaegguk', 'abc')
    const key2 = buildProductUniqueKey('domaegguk', 'abc')
    expect(key1).toBe(key2)
  })

  it('source가 다르면 다른 키', () => {
    const key1 = buildProductUniqueKey('domaegguk', '100')
    const key2 = buildProductUniqueKey('ownerclan', '100')
    expect(key1).not.toBe(key2)
  })

  it('sourceProductId가 다르면 다른 키', () => {
    const key1 = buildProductUniqueKey('domaegguk', '100')
    const key2 = buildProductUniqueKey('domaegguk', '200')
    expect(key1).not.toBe(key2)
  })
})

describe('assertProductUniqueKey', () => {
  it('정상 uniqueKey → 예외 없음', () => {
    expect(() => assertProductUniqueKey('domaegguk:12345')).not.toThrow()
    expect(() => assertProductUniqueKey('ownerclan:oc-999')).not.toThrow()
  })

  it('빈 문자열 → Error throw', () => {
    expect(() => assertProductUniqueKey('')).toThrow(
      'uniqueKey is required before saving Product'
    )
  })

  it('공백 문자열 → Error throw', () => {
    expect(() => assertProductUniqueKey('   ')).toThrow(
      'uniqueKey is required before saving Product'
    )
  })

  it('null → Error throw', () => {
    expect(() => assertProductUniqueKey(null)).toThrow(
      'uniqueKey is required before saving Product'
    )
  })

  it('undefined → Error throw', () => {
    expect(() => assertProductUniqueKey(undefined)).toThrow(
      'uniqueKey is required before saving Product'
    )
  })
})
