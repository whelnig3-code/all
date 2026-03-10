// =============================================
// 재고 캐시 서비스 — DB 기반 캐시 계산
// =============================================

import { SAFE_STOCK, STOCK_CACHE_TTL_MS } from './constants'

interface StockFields {
  cachedStock: number
  reservedStock: number
}

/**
 * 가용 재고 = cachedStock - reservedStock
 * 실제로 예약 가능한 수량
 */
export function getAvailableStock(product: StockFields): number {
  return product.cachedStock - product.reservedStock
}

/**
 * 판매 가능 재고 = cachedStock - reservedStock - SAFE_STOCK
 * 안전 재고를 제외한 실제 판매 가능 수량 (음수면 0)
 */
export function getSellableStock(product: StockFields): number {
  return Math.max(product.cachedStock - product.reservedStock - SAFE_STOCK, 0)
}

/**
 * 캐시 유효성 확인: lastStockSync 이후 TTL 이내이면 fresh
 */
export function isStockCacheFresh(lastStockSync: Date | null): boolean {
  if (lastStockSync === null) return false
  const elapsed = Date.now() - lastStockSync.getTime()
  return elapsed < STOCK_CACHE_TTL_MS
}

/**
 * 재고 부족 여부 확인: cachedStock <= SAFE_STOCK
 */
export function isStockLow(product: StockFields): boolean {
  return product.cachedStock <= SAFE_STOCK
}

/**
 * 재고 소진 여부 확인: cachedStock <= 0
 */
export function isStockOut(product: StockFields): boolean {
  return product.cachedStock <= 0
}
