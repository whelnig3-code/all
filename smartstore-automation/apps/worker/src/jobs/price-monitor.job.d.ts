import { Worker } from 'bullmq';
/**
 * 가격 모니터링 워커
 * - 네이버 쇼핑에서 경쟁가 크롤링
 * - 마진 15% 보장하며 가격 조정
 */
export declare function createPriceMonitorWorker(): Worker;
/**
 * 모든 활성 상품을 가격 모니터링 큐에 추가
 */
export declare function enqueueActiveProductsForPriceMonitor(priceMonitorQueue: import('bullmq').Queue): Promise<number>;
//# sourceMappingURL=price-monitor.job.d.ts.map