/** 블로그 포스트 게시 요청 */
export interface NaverBlogPostRequest {
    /** 포스트 제목 */
    title: string;
    /** 포스트 본문 (HTML) */
    contents: string;
    /** 태그 (쉼표 구분) */
    tags?: string;
    /** 공개 여부 (기본 true) */
    isOpenPost?: boolean;
}
/** 블로그 포스트 게시 결과 */
export interface NaverBlogPostResult {
    /** 게시 성공 여부 */
    success: boolean;
    /** 게시된 포스트 URL (성공 시) */
    postUrl?: string;
    /** 오류 메시지 (실패 시) */
    error?: string;
}
/**
 * 네이버 블로그에 포스트 게시
 *
 * - NAVER_BLOG_ACCESS_TOKEN 환경변수 필요 (OAuth 2.0 사용자 토큰)
 * - BLOG_POSTING_ENABLED=false 이면 dry-run 로그만 출력
 */
export declare function postToNaverBlog(post: NaverBlogPostRequest): Promise<NaverBlogPostResult>;
//# sourceMappingURL=blog.d.ts.map