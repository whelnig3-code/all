// =============================================
// 오너클랜 크롤러 테스트
// =============================================

import { OwnerclanCrawler } from './crawler'
import type { OwnerclanProduct } from './types'

jest.mock('@smartstore/shared', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}))

describe('OwnerclanCrawler', () => {
  let crawler: OwnerclanCrawler

  beforeEach(() => {
    crawler = new OwnerclanCrawler({ headless: true })
  })

  afterEach(async () => {
    await crawler.close()
  })

  it('baseUrl이 오너클랜 도메인임', () => {
    expect(crawler.baseUrl).toBe('https://www.ownerclan.com')
  })

  it('buildUniqueKey가 "ownerclan:{id}" 형식 반환', () => {
    expect(crawler.buildUniqueKey('54321')).toBe('ownerclan:54321')
    expect(crawler.buildUniqueKey('88888')).toBe('ownerclan:88888')
  })

  it('allowedCategories가 없으면 전체 상품 반환', () => {
    const products = makeProducts([
      { category: '뷰티' },
      { category: '생활용품' },
    ])

    const result = crawler.filterProducts(products)
    expect(result).toHaveLength(2)
  })

  it('allowedCategories로 필터링', () => {
    const products = makeProducts([
      { category: '뷰티' },
      { category: '생활용품' },
      { category: '뷰티/스킨케어' },
    ])

    const result = crawler.filterProducts(products, {
      allowedCategories: ['뷰티'],
    })

    expect(result).toHaveLength(2)
    expect(result.map(p => p.category)).toEqual(['뷰티', '뷰티/스킨케어'])
  })

  it('빈 allowedCategories → 전체 차단', () => {
    const products = makeProducts([{ category: '뷰티' }])

    const result = crawler.filterProducts(products, {
      allowedCategories: [],
    })

    expect(result).toHaveLength(0)
  })

  it('uniqueKey는 도매꾹과 다른 prefix 사용', () => {
    expect(crawler.buildUniqueKey('100')).toBe('ownerclan:100')
    expect(crawler.buildUniqueKey('100')).not.toContain('domaegguk')
  })
})

function makeProducts(
  overrides: Array<Partial<OwnerclanProduct>>,
): OwnerclanProduct[] {
  return overrides.map((o, i) => ({
    sourceProductId: `prod-${i}`,
    name: `상품 ${i}`,
    category: '기타',
    wholesalePrice: 8000,
    shippingFee: 3000,
    imageUrl: 'https://example.com/img.jpg',
    detailUrl: 'https://www.ownerclan.com/V2/Product/Detail/12345',
    stockQuantity: 100,
    minOrderQuantity: 1,
    ...o,
  }))
}
