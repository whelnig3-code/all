import { Worker, Queue } from 'bullmq';
/**
 * 콘텐츠 생성 워커
 * - LLM으로 상품 설명 자동 생성
 */
export declare function createContentWorker(): Worker;
/**
 * 설명 미생성 상품을 콘텐츠 큐에 추가
 * - 최초 등록 직후 또는 수동 재생성 시 호출
 */
export declare function enqueueProductsForContentGeneration(contentQueue: Queue): Promise<number>;
//# sourceMappingURL=content.job.d.ts.map