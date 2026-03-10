// =============================================
// 경쟁가 이상치 필터
// - 중위가 기준 50~200% 범위만 유효 경쟁가로 인정
// - 완전히 다른 제품이 섞이는 문제 해결
// =============================================

export interface FilterOptions<T> {
  getPrice?: (item: T) => number
  lowerRatio?: number
  upperRatio?: number
}

export interface FilteredCompetitorResult<T> {
  filtered: T[]
  removed: T[]
  median: number
}

/**
 * 경쟁가 이상치 필터
 *
 * 마트에서 "사과" 검색했더니 27원짜리 사탕부터 65만원짜리 사과나무까지 나오는 상황 방지.
 * 중위가 기준 50~200% 범위만 유효 경쟁가로 인정한다.
 */
export function filterCompetitorPrices<T>(
  prices: T[],
  options?: FilterOptions<T>,
): FilteredCompetitorResult<T> {
  const getPrice = options?.getPrice ?? ((item: T) => (item as { price: number }).price)
  const lowerRatio = options?.lowerRatio ?? 0.5
  const upperRatio = options?.upperRatio ?? 2.0

  if (prices.length < 2) {
    return {
      filtered: [...prices],
      removed: [],
      median: prices.length === 1 ? getPrice(prices[0]) : 0,
    }
  }

  const sorted = [...prices].sort((a, b) => getPrice(a) - getPrice(b))
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 0
    ? Math.round((getPrice(sorted[mid - 1]) + getPrice(sorted[mid])) / 2)
    : getPrice(sorted[mid])

  const lower = Math.round(median * lowerRatio)
  const upper = Math.round(median * upperRatio)

  const filtered: T[] = []
  const removed: T[] = []

  for (const item of prices) {
    const p = getPrice(item)
    if (p >= lower && p <= upper) {
      filtered.push(item)
    } else {
      removed.push(item)
    }
  }

  return { filtered, removed, median }
}
