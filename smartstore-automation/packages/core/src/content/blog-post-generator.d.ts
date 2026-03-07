export interface BlogPostInput {
    /** 상품명 */
    productName: string;
    /** 카테고리 */
    category: string;
    /** 판매가 (원) */
    salePrice: number;
    /** 상품 설명 (선택) */
    description?: string;
    /** 추가 키워드 (선택) */
    keywords?: string[];
}
export interface BlogPost {
    /** 블로그 포스트 제목 */
    title: string;
    /** 블로그 포스트 본문 (HTML) */
    body: string;
    /** 태그 배열 (네이버 블로그 태그) */
    tags: string[];
}
/**
 * 카테고리 기반 SEO 태그 생성
 */
export declare function buildTagsForCategory(category: string, productName: string): string[];
/**
 * 템플릿 기반 블로그 포스트 생성 (LLM 실패 시 fallback)
 * - 동기 함수, 항상 성공해야 함
 */
export declare function buildBlogPostFromTemplate(input: BlogPostInput): BlogPost;
/**
 * LLM 기반 블로그 포스트 생성
 * LLM 실패 또는 빈 응답 시 buildBlogPostFromTemplate() fallback
 */
export declare function generateBlogPost(input: BlogPostInput): Promise<BlogPost>;
//# sourceMappingURL=blog-post-generator.d.ts.map