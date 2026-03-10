// =============================================
// 재고 관리 상수 (절대 수정 금지 — guards.ts와 동급)
// =============================================

/** 안전 재고: 이 수량 이하면 판매 중지 트리거 */
export const SAFE_STOCK = 2

/** 재고 동기화 주기: 10분 */
export const POLL_INTERVAL_MS = 10 * 60 * 1000

/** 재고 조회 최대 재시도 횟수 */
export const MAX_RETRY = 3

/** 재고 캐시 유효 시간: 10분 */
export const STOCK_CACHE_TTL_MS = 10 * 60 * 1000
