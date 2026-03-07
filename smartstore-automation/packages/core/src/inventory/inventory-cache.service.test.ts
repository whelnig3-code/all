// =============================================
// 재고 캐시 서비스 테스트 (RED → GREEN)
// =============================================

import {
  getAvailableStock,
  getSellableStock,
  isStockCacheFresh,
  isStockLow,
  isStockOut,
} from './inventory-cache.service'
import { SAFE_STOCK, STOCK_CACHE_TTL_MS } from './constants'

describe('getAvailableStock', () => {
  it('cachedStock에서 reservedStock을 뺀 값을 반환한다', () => {
    const product = { cachedStock: 10, reservedStock: 3 }
    expect(getAvailableStock(product)).toBe(7)
  })

  it('예약이 없으면 cachedStock 그대로 반환한다', () => {
    const product = { cachedStock: 5, reservedStock: 0 }
    expect(getAvailableStock(product)).toBe(5)
  })

  it('전부 예약되면 0을 반환한다', () => {
    const product = { cachedStock: 3, reservedStock: 3 }
    expect(getAvailableStock(product)).toBe(0)
  })

  it('초과 예약(비정상)이면 음수를 반환한다', () => {
    const product = { cachedStock: 2, reservedStock: 5 }
    expect(getAvailableStock(product)).toBe(-3)
  })

  it('둘 다 0이면 0을 반환한다', () => {
    const product = { cachedStock: 0, reservedStock: 0 }
    expect(getAvailableStock(product)).toBe(0)
  })
})

describe('getSellableStock', () => {
  it('cachedStock - reservedStock - SAFE_STOCK을 반환한다', () => {
    const product = { cachedStock: 10, reservedStock: 3 }
    // 10 - 3 - 2 = 5
    expect(getSellableStock(product)).toBe(10 - 3 - SAFE_STOCK)
  })

  it('안전 재고 이하이면 0을 반환한다 (음수 방지)', () => {
    const product = { cachedStock: 2, reservedStock: 0 }
    // 2 - 0 - 2 = 0
    expect(getSellableStock(product)).toBe(0)
  })

  it('안전 재고 미만이면 0을 반환한다 (음수 방지)', () => {
    const product = { cachedStock: 1, reservedStock: 0 }
    // 1 - 0 - 2 = -1 → 0
    expect(getSellableStock(product)).toBe(0)
  })

  it('예약 + 안전재고가 cachedStock을 초과하면 0을 반환한다', () => {
    const product = { cachedStock: 3, reservedStock: 2 }
    // 3 - 2 - 2 = -1 → 0
    expect(getSellableStock(product)).toBe(0)
  })

  it('충분한 재고가 있으면 정확한 판매 가능 수량을 반환한다', () => {
    const product = { cachedStock: 100, reservedStock: 10 }
    // 100 - 10 - 2 = 88
    expect(getSellableStock(product)).toBe(88)
  })
})

describe('isStockCacheFresh', () => {
  it('lastStockSync가 null이면 false (동기화된 적 없음)', () => {
    expect(isStockCacheFresh(null)).toBe(false)
  })

  it('TTL 이내이면 fresh (true)', () => {
    const recentSync = new Date(Date.now() - 5 * 60 * 1000) // 5분 전
    expect(isStockCacheFresh(recentSync)).toBe(true)
  })

  it('TTL 초과이면 stale (false)', () => {
    const oldSync = new Date(Date.now() - 15 * 60 * 1000) // 15분 전
    expect(isStockCacheFresh(oldSync)).toBe(false)
  })

  it('정확히 TTL 경계에서는 stale (false)', () => {
    const exactBoundary = new Date(Date.now() - STOCK_CACHE_TTL_MS)
    expect(isStockCacheFresh(exactBoundary)).toBe(false)
  })

  it('방금 동기화했으면 fresh (true)', () => {
    const justNow = new Date()
    expect(isStockCacheFresh(justNow)).toBe(true)
  })
})

describe('isStockLow', () => {
  it('cachedStock이 SAFE_STOCK 이하이면 true', () => {
    expect(isStockLow({ cachedStock: SAFE_STOCK, reservedStock: 0 })).toBe(true)
    expect(isStockLow({ cachedStock: 1, reservedStock: 0 })).toBe(true)
    expect(isStockLow({ cachedStock: 0, reservedStock: 0 })).toBe(true)
  })

  it('cachedStock이 SAFE_STOCK 초과이면 false', () => {
    expect(isStockLow({ cachedStock: SAFE_STOCK + 1, reservedStock: 0 })).toBe(false)
    expect(isStockLow({ cachedStock: 100, reservedStock: 0 })).toBe(false)
  })

  it('reservedStock은 판단에 영향 없음 (cachedStock 기준)', () => {
    expect(isStockLow({ cachedStock: 10, reservedStock: 9 })).toBe(false)
  })
})

describe('isStockOut', () => {
  it('cachedStock이 0이면 true', () => {
    expect(isStockOut({ cachedStock: 0, reservedStock: 0 })).toBe(true)
  })

  it('cachedStock이 음수(비정상)이면 true', () => {
    expect(isStockOut({ cachedStock: -1, reservedStock: 0 })).toBe(true)
  })

  it('cachedStock이 1이라도 있으면 false', () => {
    expect(isStockOut({ cachedStock: 1, reservedStock: 0 })).toBe(false)
  })
})
