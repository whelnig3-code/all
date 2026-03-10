// =============================================
// 도매꾹 크롤러 테스트
// =============================================

import { DomaeggukCrawler } from './crawler'
import type { DomaeggukProduct } from './types'

jest.mock('@smartstore/shared', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}))

describe('DomaeggukCrawler', () => {
  let crawler: DomaeggukCrawler

  beforeEach(() => {
    crawler = new DomaeggukCrawler({ headless: true })
  })

  afterEach(async () => {
    await crawler.close()
  })

  // ---- 기본 인터페이스 ----

  it('baseUrl이 도매꾹 도메인임', () => {
    expect(crawler.baseUrl).toBe('https://domeggook.com')
  })

  it('buildUniqueKey가 "domaegguk:{id}" 형식 반환', () => {
    expect(crawler.buildUniqueKey('12345')).toBe('domaegguk:12345')
    expect(crawler.buildUniqueKey('99999')).toBe('domaegguk:99999')
  })

  // ---- 카테고리 필터링 ----

  it('allowedCategories가 없으면 전체 상품 반환', () => {
    const products = makeProducts([
      { category: '패션의류' },
      { category: '전자제품' },
      { category: '식품' },
    ])

    const result = crawler.filterProducts(products)
    expect(result).toHaveLength(3)
  })

  it('allowedCategories로 필터링 — 매칭되는 카테고리만 반환', () => {
    const products = makeProducts([
      { category: '패션의류' },
      { category: '전자제품' },
      { category: '식품' },
      { category: '패션잡화' },
    ])

    const result = crawler.filterProducts(products, {
      allowedCategories: ['패션'],
    })

    expect(result).toHaveLength(2)
    expect(result.map(p => p.category)).toEqual(['패션의류', '패션잡화'])
  })

  it('allowedCategories 부분 매칭 — "식품"이 "건강기능식품"에 매칭', () => {
    const products = makeProducts([
      { category: '건강기능식품/비타민' },
      { category: '전자제품' },
    ])

    const result = crawler.filterProducts(products, {
      allowedCategories: ['식품'],
    })

    expect(result).toHaveLength(1)
    expect(result[0]!.category).toBe('건강기능식품/비타민')
  })

  it('빈 allowedCategories → 전체 차단', () => {
    const products = makeProducts([
      { category: '패션의류' },
      { category: '전자제품' },
    ])

    const result = crawler.filterProducts(products, {
      allowedCategories: [],
    })

    expect(result).toHaveLength(0)
  })

  // ---- uniqueKey 불변성 ----

  it('uniqueKey 생성 시 원본 데이터 변경 없음', () => {
    const id = '12345'
    const key = crawler.buildUniqueKey(id)

    expect(key).toBe('domaegguk:12345')
    expect(id).toBe('12345') // 원본 불변
  })
})

/** 테스트 데이터 헬퍼 */
function makeProducts(
  overrides: Array<Partial<DomaeggukProduct>>,
): DomaeggukProduct[] {
  return overrides.map((o, i) => ({
    sourceProductId: `prod-${i}`,
    name: `상품 ${i}`,
    category: '기타',
    wholesalePrice: 10000,
    shippingFee: 2500,
    imageUrl: 'https://example.com/img.jpg',
    detailUrl: 'https://domeggook.com/item/12345',
    stockQuantity: 100,
    minOrderQuantity: 1,
    ...o,
  }))
}
