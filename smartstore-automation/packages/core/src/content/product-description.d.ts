import type { LLMAdapter } from '@smartstore/adapters';
/** 상품 설명 생성 입력 */
export interface ProductDescriptionInput {
    /** 상품명 */
    productName: string;
    /** 도매처 원문 설명 (크롤링 텍스트) */
    rawDescription: string;
    /** 네이버 카테고리명 */
    categoryName?: string;
    /** 판매가 (가격대 힌트용) */
    salePrice?: number;
}
/** 생성된 상품 설명 */
export interface ProductDescriptionResult {
    /** 핵심 특징 (불릿 형태) */
    highlights: string[];
    /** 상세 설명 본문 */
    detailDescription: string;
    /** 주의사항 */
    cautions: string;
    /** 사용한 LLM 모델 */
    generatedBy: string;
}
/**
 * 상품 설명 생성
 *
 * @param input 상품 정보
 * @param llmAdapter LLM 어댑터 (의존성 주입)
 * @returns 구조화된 상품 설명
 */
export declare function generateProductDescription(input: ProductDescriptionInput, llmAdapter: LLMAdapter): Promise<ProductDescriptionResult>;
/**
 * 상품 설명을 네이버 스마트스토어 HTML 형식으로 변환
 * (선택적 — 필요 시 사용)
 */
export declare function descriptionToNaverHtml(desc: ProductDescriptionResult): string;
//# sourceMappingURL=product-description.d.ts.map