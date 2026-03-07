/**
 * 큐 심도 상한 — 이 값을 초과하는 요청은 즉시 fallback 50 반환
 * workerConcurrency=1 베타 환경에서는 사실상 도달 불가
 */
export declare const MAX_QUEUE_DEPTH = 10;
/** @internal 테스트 전용 — 큐 및 심도 초기화 */
export declare function _resetQueueForTest(): void;
/** 현재 큐 심도 (모니터링/테스트용) */
export declare function getQueueDepth(): number;
/**
 * 네이버쇼핑 경쟁사 수 실조회 (Promise Queue — 동시 1개 보장)
 *
 * - 이전 조회가 완료된 후 다음 조회 시작 (순차 실행)
 * - 큐 심도 MAX_QUEUE_DEPTH 초과 시 즉시 fallback 50 반환
 * - 5초 타임아웃 또는 오류 시 보수적 기본값 50 반환
 *
 * @param productName 조회할 상품명
 * @returns 경쟁사 수 (큐 초과/오류/타임아웃 시 50)
 */
export declare function fetchCompetitorCountLimited(productName: string): Promise<number>;
//# sourceMappingURL=competitor-limiter.d.ts.map