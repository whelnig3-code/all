// =============================================
// 블로그 포스트 생성 모듈 단위 테스트
// =============================================

import {
  generateBlogPost,
  buildBlogPostFromTemplate,
  buildBlogPostWithSections,
  buildTagsForCategory,
  type BlogPostInput,
} from './blog-post-generator'

// LLM 어댑터 mock
jest.mock('@smartstore/adapters', () => ({
  llmAdapter: {
    generate: jest.fn(),
    healthCheck: jest.fn().mockResolvedValue(true),
  },
}))

import { llmAdapter } from '@smartstore/adapters'
const mockGenerate = llmAdapter.generate as jest.MockedFunction<typeof llmAdapter.generate>

// =============================================
// buildTagsForCategory
// =============================================

describe('buildTagsForCategory', () => {
  it('카테고리와 상품명 기반으로 태그 배열 반환', () => {
    const tags = buildTagsForCategory('공구/DIY', '다용도 드라이버 세트')
    expect(Array.isArray(tags)).toBe(true)
    expect(tags.length).toBeGreaterThan(0)
  })

  it('공구 카테고리 → DIY 관련 태그 포함', () => {
    const tags = buildTagsForCategory('공구/DIY', '렌치 세트')
    expect(tags.some((t) => t.includes('공구') || t.includes('DIY'))).toBe(true)
  })

  it('생활용품 카테고리 → 생활 관련 태그 포함', () => {
    const tags = buildTagsForCategory('생활용품', '수납 바구니')
    expect(tags.some((t) => t.includes('생활') || t.includes('수납') || t.includes('인테리어'))).toBe(true)
  })

  it('상품명 단어가 태그에 포함됨', () => {
    const tags = buildTagsForCategory('전자기기', '블루투스 스피커')
    // 상품명 단어 중 하나라도 태그에 포함되어야 함
    expect(tags.some((t) => t.includes('블루투스') || t.includes('스피커'))).toBe(true)
  })

  it('중복 태그 없음', () => {
    const tags = buildTagsForCategory('공구/DIY', '드릴 세트')
    const unique = new Set(tags)
    expect(unique.size).toBe(tags.length)
  })

  it('태그는 10개 이하 반환', () => {
    const tags = buildTagsForCategory('패션', '봄 원피스')
    expect(tags.length).toBeLessThanOrEqual(10)
  })
})

// =============================================
// buildBlogPostFromTemplate
// =============================================

describe('buildBlogPostFromTemplate', () => {
  const baseInput: BlogPostInput = {
    productName: '다용도 공구 세트 10종',
    category: '공구/DIY',
    salePrice: 25000,
  }

  it('title, body, tags 필드를 모두 포함한 BlogPost 반환', () => {
    const result = buildBlogPostFromTemplate(baseInput)
    expect(result).toHaveProperty('title')
    expect(result).toHaveProperty('body')
    expect(result).toHaveProperty('tags')
  })

  it('title에 상품명이 포함됨', () => {
    const result = buildBlogPostFromTemplate(baseInput)
    expect(result.title).toContain('다용도 공구 세트 10종')
  })

  it('body에 판매가가 포함됨', () => {
    const result = buildBlogPostFromTemplate(baseInput)
    expect(result.body).toContain('25,000')
  })

  it('body가 비어있지 않음', () => {
    const result = buildBlogPostFromTemplate(baseInput)
    expect(result.body.trim().length).toBeGreaterThan(0)
  })

  it('tags가 배열이며 비어있지 않음', () => {
    const result = buildBlogPostFromTemplate(baseInput)
    expect(Array.isArray(result.tags)).toBe(true)
    expect(result.tags.length).toBeGreaterThan(0)
  })

  it('description 제공 시 body에 포함됨', () => {
    const input: BlogPostInput = {
      ...baseInput,
      description: '고품질 크롬 바나듐 소재',
    }
    const result = buildBlogPostFromTemplate(input)
    expect(result.body).toContain('고품질 크롬 바나듐 소재')
  })

  it('금칙어 "최고" → "실용적"으로 치환됨', () => {
    const input: BlogPostInput = {
      ...baseInput,
      description: '최고의 품질',
    }
    const result = buildBlogPostFromTemplate(input)
    expect(result.body).not.toContain('최고의 품질')
  })

  it('title이 100자 이내', () => {
    const input: BlogPostInput = {
      ...baseInput,
      productName: 'a'.repeat(120),
    }
    const result = buildBlogPostFromTemplate(input)
    expect(result.title.length).toBeLessThanOrEqual(100)
  })

  it('XSS: 상품명의 HTML 특수문자가 이스케이프됨', () => {
    const input: BlogPostInput = {
      ...baseInput,
      productName: '<script>alert("xss")</script>공구',
    }
    const result = buildBlogPostFromTemplate(input)
    expect(result.body).not.toContain('<script>')
    expect(result.body).toContain('&lt;script&gt;')
  })

  it('XSS: 카테고리의 HTML 특수문자가 이스케이프됨', () => {
    const input: BlogPostInput = {
      ...baseInput,
      category: '공구"><img src=x onerror=alert(1)>',
    }
    const result = buildBlogPostFromTemplate(input)
    expect(result.body).not.toContain('<img')
    expect(result.body).toContain('&gt;')
  })
})

// =============================================
// buildBlogPostWithSections
// =============================================

describe('buildBlogPostWithSections', () => {
  const baseInput: BlogPostInput = {
    productName: '스테인리스 렌치 세트',
    category: '공구/DIY',
    salePrice: 18000,
  }

  it('sections 배열이 비어있지 않음', () => {
    const result = buildBlogPostWithSections(baseInput)
    expect(result.sections.length).toBeGreaterThan(0)
  })

  it('각 section에 heading과 content가 있음', () => {
    const result = buildBlogPostWithSections(baseInput)
    for (const section of result.sections) {
      expect(section.heading.length).toBeGreaterThan(0)
      expect(section.content.length).toBeGreaterThan(0)
    }
  })

  it('plainText에 bullet(- ) 형식이 포함됨', () => {
    const result = buildBlogPostWithSections(baseInput)
    expect(result.plainText).toContain('- ')
  })

  it('plainText에 HTML 태그가 없음', () => {
    const result = buildBlogPostWithSections(baseInput)
    expect(result.plainText).not.toMatch(/<[^>]+>/)
  })

  it('plainText에 판매가가 포함됨', () => {
    const result = buildBlogPostWithSections(baseInput)
    expect(result.plainText).toContain('18,000')
  })

  it('description 제공 시 상품 특징 섹션 추가', () => {
    const input = { ...baseInput, description: '크롬 바나듐 소재' }
    const result = buildBlogPostWithSections(input)
    const hasFeatureSection = result.sections.some((s) => s.heading === '상품 특징')
    expect(hasFeatureSection).toBe(true)
  })

  it('description 없으면 상품 특징 섹션 없음', () => {
    const result = buildBlogPostWithSections(baseInput)
    const hasFeatureSection = result.sections.some((s) => s.heading === '상품 특징')
    expect(hasFeatureSection).toBe(false)
  })

  it('3만원 이상이면 무료배송 표시', () => {
    const input = { ...baseInput, salePrice: 35000 }
    const result = buildBlogPostWithSections(input)
    expect(result.body).toContain('무료배송')
  })
})

// =============================================
// generateBlogPost
// =============================================

describe('generateBlogPost', () => {
  const baseInput: BlogPostInput = {
    productName: '스테인리스 렌치 세트',
    category: '공구/DIY',
    salePrice: 18000,
  }

  beforeEach(() => {
    mockGenerate.mockReset()
  })

  it('LLM 성공 시 title/body/tags 포함한 BlogPost 반환', async () => {
    mockGenerate.mockResolvedValue({
      content: '## 렌치 세트 소개\n\n고품질 스테인리스 렌치 세트를 소개합니다.',
      model: 'llama3.2',
      tokensUsed: 150,
    })

    const result = await generateBlogPost(baseInput)
    expect(result).toHaveProperty('title')
    expect(result).toHaveProperty('body')
    expect(result).toHaveProperty('tags')
    expect(result.title.length).toBeGreaterThan(0)
    expect(result.body.length).toBeGreaterThan(0)
    expect(result.tags.length).toBeGreaterThan(0)
  })

  it('LLM 성공 시 body에 LLM 생성 콘텐츠가 포함됨', async () => {
    mockGenerate.mockResolvedValue({
      content: '고품질 스테인리스 렌치 세트를 소개합니다.',
      model: 'llama3.2',
      tokensUsed: 150,
    })

    const result = await generateBlogPost(baseInput)
    expect(result.body).toContain('고품질 스테인리스 렌치 세트')
  })

  it('LLM 실패 시 template fallback으로 BlogPost 반환 (예외 미발생)', async () => {
    mockGenerate.mockRejectedValue(new Error('Ollama 연결 실패'))

    const result = await generateBlogPost(baseInput)
    // 예외 없이 결과 반환
    expect(result).toHaveProperty('title')
    expect(result).toHaveProperty('body')
    expect(result).toHaveProperty('tags')
  })

  it('LLM 실패 시 fallback body에 상품명 포함', async () => {
    mockGenerate.mockRejectedValue(new Error('timeout'))

    const result = await generateBlogPost(baseInput)
    expect(result.body).toContain('스테인리스 렌치 세트')
  })

  it('LLM 빈 응답 시 template fallback 사용', async () => {
    mockGenerate.mockResolvedValue({
      content: '',
      model: 'llama3.2',
      tokensUsed: 0,
    })

    const result = await generateBlogPost(baseInput)
    expect(result.body.length).toBeGreaterThan(0)
  })

  it('반환된 title이 100자 이내', async () => {
    mockGenerate.mockResolvedValue({
      content: 'a'.repeat(500),
      model: 'llama3.2',
      tokensUsed: 500,
    })

    const result = await generateBlogPost(baseInput)
    expect(result.title.length).toBeLessThanOrEqual(100)
  })
})
