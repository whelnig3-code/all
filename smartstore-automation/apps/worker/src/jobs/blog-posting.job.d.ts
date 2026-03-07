import { Worker } from 'bullmq';
/**
 * 블로그 포스팅 워커
 * - LLM 생성 실패 시 템플릿 fallback 자동 적용 (generateBlogPost 내부)
 * - 네이버 API 실패 시 로그 남기고 정상 종료
 */
export declare function createBlogPostingWorker(): Worker;
//# sourceMappingURL=blog-posting.job.d.ts.map