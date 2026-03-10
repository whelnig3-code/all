// =============================================
// 상품 설명 자동 생성 서비스 (LLM 기반)
//
// 역할: 도매 상품 원문 → 네이버 스마트스토어 최적화 상품 설명 생성
//
// 생성 전략:
//   1. 시스템 프롬프트: "쇼핑몰 MD" 역할 부여
//   2. 사용자 프롬프트: 상품명 + 원문 설명 + 카테고리 + 가격대
//   3. 출력: HTML 태그 없는 순수 텍스트 (3개 섹션)
//      - 핵심 특징 (불릿 3~5개)
//      - 상세 설명 (2~3 문단)
//      - 주의사항
// =============================================

import type { LLMAdapter } from '@smartstore/adapters'
import { createLogger } from '@smartstore/shared'

const logger = createLogger('product-description')

/** 상품 설명 생성 입력 */
export interface ProductDescriptionInput {
  /** 상품명 */
  productName: string
  /** 도매처 원문 설명 (크롤링 텍스트) */
  rawDescription: string
  /** 네이버 카테고리명 */
  categoryName?: string
  /** 판매가 (가격대 힌트용) */
  salePrice?: number
}

/** 생성된 상품 설명 */
export interface ProductDescriptionResult {
  /** 핵심 특징 (불릿 형태) */
  highlights: string[]
  /** 상세 설명 본문 */
  detailDescription: string
  /** 주의사항 */
  cautions: string
  /** 사용한 LLM 모델 */
  generatedBy: string
}

/** 시스템 프롬프트 — 쇼핑몰 MD 역할 부여 */
const SYSTEM_PROMPT = `당신은 10년 경력의 네이버 스마트스토어 전문 MD입니다.
도매 상품 정보를 받아 구매 전환율이 높은 상품 설명으로 변환하는 것이 역할입니다.

출력 규칙:
1. HTML 태그 없이 순수 텍스트만 출력
2. 섹션 구분: [핵심특징], [상세설명], [주의사항]
3. 핵심특징: "• " 로 시작하는 불릿 3~5개
4. 상세설명: 2~3 문단, 각 문단은 빈 줄로 구분
5. 주의사항: 배송/교환/반품 기본 문구 포함
6. 과장 광고 금지 (공정거래위원회 지침 준수)
7. 한국어로만 작성`

/**
 * 상품 설명 생성
 *
 * @param input 상품 정보
 * @param llmAdapter LLM 어댑터 (의존성 주입)
 * @returns 구조화된 상품 설명
 */
export async function generateProductDescription(
  input: ProductDescriptionInput,
  llmAdapter: LLMAdapter
): Promise<ProductDescriptionResult> {
  const { productName, rawDescription, categoryName, salePrice } = input

  // 사용자 프롬프트 구성
  const userPrompt = buildUserPrompt({ productName, rawDescription, categoryName, salePrice })

  logger.info('상품 설명 생성 시작', { productName })

  const result = await llmAdapter.generate({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 1500,
    temperature: 0.7,
  })

  // 섹션 파싱
  const parsed = parseGeneratedContent(result.content)

  logger.info('상품 설명 생성 완료', {
    productName,
    model: result.model,
    highlightsCount: parsed.highlights.length,
  })

  return {
    ...parsed,
    generatedBy: result.model,
  }
}

/**
 * 사용자 프롬프트 빌더
 */
function buildUserPrompt(input: ProductDescriptionInput): string {
  const lines = [
    `상품명: ${input.productName}`,
    input.categoryName ? `카테고리: ${input.categoryName}` : '',
    input.salePrice ? `판매가: ${input.salePrice.toLocaleString()}원` : '',
    '',
    '=== 도매처 원문 설명 ===',
    input.rawDescription.slice(0, 2000), // 토큰 절약을 위해 2000자 제한
    '',
    '위 정보를 바탕으로 네이버 스마트스토어 상품 설명을 작성해주세요.',
  ]

  return lines.filter((l) => l !== undefined).join('\n')
}

/**
 * LLM 출력 텍스트를 구조화된 결과로 파싱
 *
 * 예상 형식:
 * [핵심특징]
 * • 특징 1
 * • 특징 2
 *
 * [상세설명]
 * 본문...
 *
 * [주의사항]
 * 주의...
 */
function parseGeneratedContent(content: string): Omit<ProductDescriptionResult, 'generatedBy'> {
  // 섹션 분리 (유연한 정규식 — LLM이 약간 다른 형식으로 출력할 수 있음)
  const highlightsMatch = content.match(/\[핵심특징\]([\s\S]*?)(?=\[상세설명\]|$)/i)
  const detailMatch = content.match(/\[상세설명\]([\s\S]*?)(?=\[주의사항\]|$)/i)
  const cautionsMatch = content.match(/\[주의사항\]([\s\S]*?)$/i)

  // 핵심특징: "• " 로 시작하는 줄 추출
  const highlightsRaw = highlightsMatch?.[1] ?? ''
  const highlights = highlightsRaw
    .split('\n')
    .map((line) => line.replace(/^[•\-\*]\s*/, '').trim())
    .filter((line) => line.length > 0)

  const detailDescription = (detailMatch?.[1] ?? '').trim()
  const cautions = (cautionsMatch?.[1] ?? '').trim()

  // 파싱 실패 시 원문 그대로 사용
  if (highlights.length === 0 && !detailDescription) {
    logger.warn('상품 설명 파싱 실패 — 원문 반환', { contentPreview: content.slice(0, 100) })
    return {
      highlights: [],
      detailDescription: content,
      cautions: '',
    }
  }

  return { highlights, detailDescription, cautions }
}

/**
 * 상품 설명을 네이버 스마트스토어 HTML 형식으로 변환
 * (선택적 — 필요 시 사용)
 */
export function descriptionToNaverHtml(desc: ProductDescriptionResult): string {
  const highlightsList = desc.highlights
    .map((h) => `<li>${h}</li>`)
    .join('\n')

  return `<div class="product-description">
<h3>핵심 특징</h3>
<ul>
${highlightsList}
</ul>

<h3>상세 설명</h3>
<p>${desc.detailDescription.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>

<h3>주의사항</h3>
<p>${desc.cautions}</p>
</div>`
}
