import { Worker } from 'bullmq';
/**
 * 도매 원가 변동 감지 워커
 * - 임계값(기본 5%) 초과 변동 감지 시 기록 및 알림
 * - marginRisk 시 판매가 재계산 후 네이버 상품 가격 업데이트
 */
export declare function createWholesaleWatcherWorker(): Worker;
/**
 * 활성 상품을 도매 원가 변동 감지 큐에 추가
 * - DB 저장 도매가와 크롤링 도매가를 비교하기 위해 crawledPrice 필요
 */
export declare function enqueueWholesaleWatcherJobs(wholesaleWatcherQueue: import('bullmq').Queue, 
/** 크롤링으로 수집한 도매 원가 (productId → crawledPrice 맵) */
crawledPrices: Map<string, number>): Promise<number>;
//# sourceMappingURL=wholesale-watcher.job.d.ts.map