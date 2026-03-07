import { Worker, Queue } from 'bullmq';
/**
 * 주문 처리 워커
 * - 개별 주문 아이템을 처리
 * - DB 저장 + 알림 발송
 */
export declare function createOrderWorker(): Worker;
/**
 * 네이버 새 주문 폴링 + 큐에 추가
 * - 스케줄러(index.ts)에서 주기적 호출
 */
export declare function pollAndEnqueueNewOrders(orderQueue: Queue): Promise<number>;
//# sourceMappingURL=order.job.d.ts.map