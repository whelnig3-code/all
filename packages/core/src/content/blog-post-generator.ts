// =============================================
// 블로그 포스트 생성 모듈 (P3)
//
// 역할:
//   - 상품 정보 기반 네이버 블로그 포스트 생성
//   - LLM(Ollama/OpenAI) 사용, 실패 시 템플릿 fallback
//   - 카테고리별 SEO 태그 자동 생성
// =============================================

import { llmAdapter } from '@smartstore/adapters'
import { createLogger } from '@smartstore/shared'

const logger = createLogger('blog-post-generator')

/** 네이버 정책 치환 규칙: [정규식, 대체 문자열] */
const BLOG_REPLACEMENT_RULES: [RegExp, string][] = [
  [/최고/g, '실용적'],
  [/100\s*%/g, ''],
  [/절대/g, ''],
  [/완전/g, ''],
  [/보장/g, ''],
]

/** 카테고리별 SEO 태그 맵 */
const CATEGORY_TAG_MAP: Record<string, string[]> = {
  '공구': ['공구', 'DIY', '공구세트', '핸드툴', '작업공구'],
  'DIY': ['DIY', '공구', '셀프인테리어', '핸드툴'],
  '생활용품': ['생활용품', '생활소품', '인테리어', '수납', '정리용품'],
  '전자기기': ['전자기기', '전자제품', '스마트기기', '테크'],
  '패션': ['패션', '스타일', '코디', '트렌드', '데일리룩'],
  '식품': ['식품', '먹거리', '건강식품', '맛집'],
  '스포츠': ['스포츠', '운동용품', '피트니스', '아웃도어'],
  '육아': ['육아', '유아용품', '아기용품', '베이비'],
}

export interface BlogPostInput {
  /** 상품명 */
  productName: string
  /** 카테고리 */
  category: string
  /** 판매가 (원) */
  salePrice: number
  /** 상품 설명 (선택) */
  description?: string
  /** 추가 키워드 (선택) */
  keywords?: string[]
}

export interface BlogPost {
  /** 블로그 포스트 제목 */
  title: string
  /** 블로그 포스트 본문 (HTML) */
  body: string
  /** 태그 배열 (네이버 블로그 태그) */
  tags: string[]
}

/**
 * 카테고리 기반 SEO 태그 생성
 */
export function buildTagsForCategory(category: string, productName: string): string[] {
  const tags = new Set<string>()

  // 카테고리 키워드 매핑
  for (const [key, words] of Object.entries(CATEGORY_TAG_MAP)) {
    if (category.includes(key)) {
      words.forEach((w) => tags.add(w))
      break
    }
  }

  // 카테고리 매핑 없으면 카테고리 자체를 태그로
  if (tags.size === 0) {
    tags.add(category)
  }

  // 상품명 주요 단어 태그 추가 (2자 이상 단어)
  productName
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .slice(0, 3)
    .forEach((w) => tags.add(w))

  // 공통 태그
  tags.add('네이버쇼핑')
  tags.add('스마트스토어')

  // 최대 10개
  return Array.from(tags).slice(0, 10)
}

/**
 * HTML 특수문자 이스케이프 (XSS 방지)
 * 크롤러 수집 데이터(상품명, 카테고리 등)를 HTML에 삽입할 때 반드시 사용
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 텍스트에 네이버 정책 치환 규칙 적용
 */
function sanitizeBlogContent(text: string): string {
  let result = text
  for (const [pattern, replacement] of BLOG_REPLACEMENT_RULES) {
    result = result.replace(pattern, replacement)
  }
  return result.replace(/\s+/g, ' ').trim()
}

/**
 * 제목 생성 (100자 이내)
 */
function buildTitle(productName: string): string {
  const base = `[추천] ${productName}`
  return base.length > 100 ? base.substring(0, 97) + '...' : base
}

/**
 * 블로그 꼭지(섹션) 구조 — 대시보드에서 각각 복사 가능
 */
export interface BlogSection {
  /** 섹션 제목 (h2/h3) */
  heading: string
  /** 섹션 본문 (HTML) */
  content: string
}

/**
 * 꼭지 포함 블로그 포스트 — 대시보드 복사용
 */
export interface BlogPostWithSections extends BlogPost {
  /** 꼭지별 분리된 섹션 */
  sections: BlogSection[]
  /** 순수 텍스트 (네이버 에디터 붙여넣기용) */
  plainText: string
}

/**
 * 템플릿 기반 블로그 포스트 생성 (LLM 실패 시 fallback)
 * - 동기 함수, 항상 성공해야 함
 */
export function buildBlogPostFromTemplate(input: BlogPostInput): BlogPost {
  const result = buildBlogPostWithSections(input)
  return { title: result.title, body: result.body, tags: result.tags }
}

/**
 * 꼭지 구조 포함 블로그 포스트 생성
 * 대시보드에서 제목/꼭지/태그 각각 복사 가능하도록 sections 포함
 */
export function buildBlogPostWithSections(input: BlogPostInput): BlogPostWithSections {
  const { productName, category, salePrice, description } = input

  const safeName = escapeHtml(productName)
  const safeCategory = escapeHtml(category)
  const sanitizedDesc = description ? escapeHtml(sanitizeBlogContent(description)) : ''
  const priceStr = salePrice.toLocaleString('ko-KR')
  const shippingNote = salePrice >= 30000 ? '무료배송' : '빠른 배송'

  const sections: BlogSection[] = [
    {
      heading: `${safeName} 추천 리뷰`,
      content: `<p>안녕하세요! 오늘은 <strong>${safeName}</strong>을(를) 소개해드리려고 합니다.</p>`,
    },
    ...(sanitizedDesc ? [{
      heading: '상품 특징',
      content: `<p>${sanitizedDesc}</p>`,
    }] : []),
    {
      heading: '상품 정보',
      content: [
        '<ul>',
        `  <li>카테고리: ${safeCategory}</li>`,
        `  <li>판매가: <strong>${priceStr}원</strong></li>`,
        `  <li>${shippingNote}</li>`,
        '</ul>',
      ].join('\n'),
    },
    {
      heading: '이런 분들께 추천해요',
      content: [
        '<ul>',
        '  <li>품질 좋은 제품을 합리적인 가격에 찾으시는 분</li>',
        '  <li>빠른 배송을 원하시는 분</li>',
        '  <li>믿을 수 있는 판매자에게 구매하고 싶으신 분</li>',
        '</ul>',
      ].join('\n'),
    },
    {
      heading: '구매 안내',
      content: [
        `<p>지금 바로 네이버 스마트스토어에서 <strong>${safeName}</strong>을(를) 확인해보세요!</p>`,
        `<p>가격: ${priceStr}원 | ${shippingNote}</p>`,
      ].join('\n'),
    },
  ]

  // 전체 HTML 합성
  const body = sections
    .map((s, i) => {
      const tag = i === 0 ? 'h2' : 'h3'
      return `<${tag}>${s.heading}</${tag}>\n${s.content}`
    })
    .join('\n\n')

  // 순수 텍스트 (네이버 에디터 붙여넣기용)
  const plainText = sections
    .map((s) => {
      const text = s.content
        .replace(/<li>/g, '- ')
        .replace(/<\/?(?:ul|li|p|strong|br)>/g, '')
        .replace(/\n\s*\n/g, '\n')
        .trim()
      return `## ${s.heading}\n${text}`
    })
    .join('\n\n')

  return {
    title: buildTitle(productName),
    body,
    tags: buildTagsForCategory(category, productName),
    sections,
    plainText,
  }
}

/**
 * LLM 기반 블로그 포스트 생성
 * LLM 실패 또는 빈 응답 시 buildBlogPostFromTemplate() fallback
 */
export async function generateBlogPost(input: BlogPostInput): Promise<BlogPost> {
  const { productName, category, salePrice, description, keywords } = input

  try {
    const systemPrompt = `당신은 네이버 블로그 마케터입니다.
상품 정보를 받아 자연스럽고 흥미로운 블로그 포스트 본문(HTML)을 작성합니다.
- h2, h3, p, ul, li 태그만 사용
- 과장 표현 금지 (최고, 100%, 절대, 보장 등)
- 3~5단락, 200자 이내로 간결하게
- 한국어로 작성`

    const userPrompt = `다음 상품의 블로그 포스트 본문을 HTML로 작성해주세요.

상품명: ${productName}
카테고리: ${category}
판매가: ${salePrice.toLocaleString('ko-KR')}원
${description ? `상품 설명: ${description}` : ''}
${keywords?.length ? `키워드: ${keywords.join(', ')}` : ''}`

    const result = await llmAdapter.generate({
      systemPrompt,
      userPrompt,
      maxTokens: 600,
      temperature: 0.7,
    })

    // 빈 응답이면 fallback
    if (!result.content?.trim()) {
      logger.warn('LLM 빈 응답 — template fallback 사용', { productName })
      return buildBlogPostFromTemplate(input)
    }

    const sanitizedBody = sanitizeBlogContent(result.content)

    logger.info('블로그 포스트 LLM 생성 완료', {
      productName,
      model: result.model,
      tokensUsed: result.tokensUsed,
    })

    return {
      title: buildTitle(productName),
      body: sanitizedBody,
      tags: buildTagsForCategory(category, productName),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.warn('LLM 블로그 포스트 생성 실패 — template fallback 사용', {
      productName,
      error: message,
    })
    return buildBlogPostFromTemplate(input)
  }
}
