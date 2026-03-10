// =============================================
// 상품 설명 자동 생성 모듈 단위 테스트
// =============================================

import {
  generateProductDescription,
  descriptionToNaverHtml,
  type ProductDescriptionInput,
  type ProductDescriptionResult,
} from './product-description'

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
// generateProductDescription
// =============================================

describe('generateProductDescription', () => {
  const baseInput: ProductDescriptionInput = {
    productName: '스테인리스 렌치 세트 10종',
    rawDescription: '고품질 크롬 바나듐 소재 렌치 세트. 10종 구성.',
    categoryName: '공구/DIY',
    salePrice: 25000,
  }

  /** 정상 LLM 응답 (섹션 형식 준수) */
  const validLLMContent = `[핵심특징]
• 크롬 바나듐 소재로 내구성 우수
• 10종 세트 구성으로 다양한 작업 가능
• 미끄럼 방지 그립 설계

[상세설명]
이 렌치 세트는 가정용부터 전문 작업까지 두루 사용할 수 있습니다.

고강도 크롬 바나듐 소재를 사용하여 오랜 사용에도 변형이 없습니다.

[주의사항]
제품 수령 후 7일 이내 교환/반품 가능합니다. 배송비는 구매자 부담입니다.`

  beforeEach(() => {
    mockGenerate.mockReset()
  })

  it('LLM 성공 시 highlights/detailDescription/cautions/generatedBy 반환', async () => {
    mockGenerate.mockResolvedValue({
      content: validLLMContent,
      model: 'llama3.2',
      tokensUsed: 200,
    })

    const result = await generateProductDescription(baseInput, llmAdapter)

    expect(result).toHaveProperty('highlights')
    expect(result).toHaveProperty('detailDescription')
    expect(result).toHaveProperty('cautions')
    expect(result).toHaveProperty('generatedBy')
  })

  it('[핵심특징] 섹션 → highlights 배열로 파싱', async () => {
    mockGenerate.mockResolvedValue({
      content: validLLMContent,
      model: 'llama3.2',
      tokensUsed: 200,
    })

    const result = await generateProductDescription(baseInput, llmAdapter)

    expect(Array.isArray(result.highlights)).toBe(true)
    expect(result.highlights.length).toBeGreaterThanOrEqual(1)
    expect(result.highlights[0]).toContain('크롬 바나듐')
  })

  it('[상세설명] 섹션 → detailDescription으로 파싱', async () => {
    mockGenerate.mockResolvedValue({
      content: validLLMContent,
      model: 'llama3.2',
      tokensUsed: 200,
    })

    const result = await generateProductDescription(baseInput, llmAdapter)

    expect(result.detailDescription).toContain('렌치 세트')
    expect(result.detailDescription.length).toBeGreaterThan(0)
  })

  it('[주의사항] 섹션 → cautions으로 파싱', async () => {
    mockGenerate.mockResolvedValue({
      content: validLLMContent,
      model: 'llama3.2',
      tokensUsed: 200,
    })

    const result = await generateProductDescription(baseInput, llmAdapter)

    expect(result.cautions).toContain('교환/반품')
  })

  it('generatedBy에 LLM model명이 들어감', async () => {
    mockGenerate.mockResolvedValue({
      content: validLLMContent,
      model: 'llama3.2',
      tokensUsed: 200,
    })

    const result = await generateProductDescription(baseInput, llmAdapter)

    expect(result.generatedBy).toBe('llama3.2')
  })

  it('LLM이 섹션 구조를 무시한 경우 → 원문 전체를 detailDescription으로 반환', async () => {
    mockGenerate.mockResolvedValue({
      content: '그냥 자유 형식으로 작성된 설명입니다.',
      model: 'llama3.2',
      tokensUsed: 50,
    })

    const result = await generateProductDescription(baseInput, llmAdapter)

    // highlights가 없으면 원문 fallback
    expect(result.detailDescription).toContain('그냥 자유 형식으로')
    expect(result.highlights).toEqual([])
  })

  it('maxTokens=1500, temperature=0.7로 LLM 호출', async () => {
    mockGenerate.mockResolvedValue({
      content: validLLMContent,
      model: 'llama3.2',
      tokensUsed: 200,
    })

    await generateProductDescription(baseInput, llmAdapter)

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        maxTokens: 1500,
        temperature: 0.7,
      })
    )
  })

  it('LLM을 정확히 1회 호출', async () => {
    mockGenerate.mockResolvedValue({
      content: validLLMContent,
      model: 'llama3.2',
      tokensUsed: 200,
    })

    await generateProductDescription(baseInput, llmAdapter)

    expect(mockGenerate).toHaveBeenCalledTimes(1)
  })

  it('rawDescription 2000자 초과 시 프롬프트에서 잘림', async () => {
    const longInput: ProductDescriptionInput = {
      ...baseInput,
      rawDescription: 'a'.repeat(3000),
    }

    mockGenerate.mockResolvedValue({
      content: validLLMContent,
      model: 'llama3.2',
      tokensUsed: 200,
    })

    await generateProductDescription(longInput, llmAdapter)

    const calledWith = mockGenerate.mock.calls[0]?.[0]
    expect(calledWith?.userPrompt).toBeDefined()
    // 2000자 초과분은 프롬프트에 포함되지 않아야 함
    expect(calledWith!.userPrompt).not.toContain('a'.repeat(2001))
  })

  it('categoryName, salePrice 없어도 정상 동작', async () => {
    const minInput: ProductDescriptionInput = {
      productName: '렌치',
      rawDescription: '렌치입니다.',
    }

    mockGenerate.mockResolvedValue({
      content: validLLMContent,
      model: 'llama3.2',
      tokensUsed: 100,
    })

    const result = await generateProductDescription(minInput, llmAdapter)

    expect(result).toHaveProperty('highlights')
    expect(result).toHaveProperty('detailDescription')
  })
})

// =============================================
// descriptionToNaverHtml
// =============================================

describe('descriptionToNaverHtml', () => {
  const baseResult: ProductDescriptionResult = {
    highlights: ['고강도 소재', '10종 구성', '미끄럼 방지 그립'],
    detailDescription: '훌륭한 렌치 세트입니다.\n\n다양한 용도로 사용 가능합니다.',
    cautions: '7일 이내 반품 가능',
    generatedBy: 'llama3.2',
  }

  it('<div class="product-description"> 래퍼 포함', () => {
    const html = descriptionToNaverHtml(baseResult)
    expect(html).toContain('<div class="product-description">')
  })

  it('highlights → <ul><li> 변환', () => {
    const html = descriptionToNaverHtml(baseResult)
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>고강도 소재</li>')
    expect(html).toContain('<li>10종 구성</li>')
    expect(html).toContain('<li>미끄럼 방지 그립</li>')
  })

  it('detailDescription 빈 줄 → </p><p> 변환', () => {
    const html = descriptionToNaverHtml(baseResult)
    expect(html).toContain('</p><p>')
  })

  it('detailDescription 단일 줄바꿈 → <br> 변환', () => {
    const singleNewline: ProductDescriptionResult = {
      ...baseResult,
      detailDescription: '첫 줄\n둘째 줄',
    }
    const html = descriptionToNaverHtml(singleNewline)
    expect(html).toContain('<br>')
  })

  it('highlights 빈 배열 → <ul></ul> 정상 처리', () => {
    const noHighlights: ProductDescriptionResult = {
      ...baseResult,
      highlights: [],
    }
    const html = descriptionToNaverHtml(noHighlights)
    expect(html).toContain('<ul>')
    expect(html).toContain('</ul>')
    // <li>가 없어야 함
    expect(html).not.toContain('<li>')
  })

  it('cautions 내용 포함', () => {
    const html = descriptionToNaverHtml(baseResult)
    expect(html).toContain('7일 이내 반품 가능')
  })

  it('반환값은 string 타입', () => {
    const html = descriptionToNaverHtml(baseResult)
    expect(typeof html).toBe('string')
    expect(html.length).toBeGreaterThan(0)
  })
})
