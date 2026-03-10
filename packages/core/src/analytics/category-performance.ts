// =============================================
// 카테고리 성과 분석 (TDD)
//
// 비유: 학교 성적표. 각 과목(카테고리)의 성적을
// 종합하여 어떤 과목에 집중할지 결정하는 것처럼,
// 매출/주문/마진 등 지표를 종합 점수로 환산하여
// 어떤 카테고리에 집중할지 판단한다.
//
// 계정별 집중 카테고리 결정에 활용.
// =============================================

/** 상품 성과 데이터 (입력) */
export interface ProductPerformanceEntry {
  readonly category: string
  readonly group: string
  readonly revenue: number
  readonly orders: number
  readonly marginRate: number
  readonly registeredDays: number
}

/** 카테고리별 성과 분석 결과 */
export interface CategoryPerformance {
  readonly category: string
  readonly group: string
  readonly totalRevenue: number
  readonly totalOrders: number
  readonly avgMarginRate: number
  readonly avgDailyRevenue: number
  readonly performanceScore: number
}

/** 가중치 설정 */
const WEIGHTS = {
  /** 매출 가중치 40% */
  REVENUE: 0.4,
  /** 주문 가중치 30% */
  ORDERS: 0.3,
  /** 마진 가중치 20% */
  MARGIN: 0.2,
  /** 일일 매출 일관성 가중치 10% */
  DAILY_REVENUE: 0.1,
} as const

/** 0~100으로 정규화 (최대값 기준) */
function normalize(value: number, max: number): number {
  if (max === 0) return 0
  return (value / max) * 100
}

/**
 * 상품 성과 데이터를 카테고리별로 집계하여 성과 점수 산출
 *
 * @param entries 상품별 성과 데이터 배열
 * @returns 카테고리별 성과 분석 결과
 */
export function analyzeCategoryPerformance(
  entries: readonly ProductPerformanceEntry[],
): readonly CategoryPerformance[] {
  if (entries.length === 0) return []

  // 1단계: 카테고리별 그룹핑 (불변 패턴)
  const grouped = entries.reduce<
    Record<string, { readonly group: string; readonly items: readonly ProductPerformanceEntry[] }>
  >((acc, entry) => {
    const existing = acc[entry.category]
    return {
      ...acc,
      [entry.category]: {
        group: entry.group,
        items: existing ? [...existing.items, entry] : [entry],
      },
    }
  }, {})

  // 2단계: 카테고리별 집계 (점수 없이)
  const aggregated = Object.entries(grouped).map(([category, { group, items }]) => {
    const totalRevenue = items.reduce((sum, item) => sum + item.revenue, 0)
    const totalOrders = items.reduce((sum, item) => sum + item.orders, 0)
    const avgMarginRate = items.reduce((sum, item) => sum + item.marginRate, 0) / items.length
    const avgDailyRevenue =
      items.reduce((sum, item) => sum + item.revenue / item.registeredDays, 0) / items.length

    return { category, group, totalRevenue, totalOrders, avgMarginRate, avgDailyRevenue }
  })

  // 3단계: 정규화를 위한 최대값 산출
  const maxRevenue = Math.max(...aggregated.map((a) => a.totalRevenue))
  const maxOrders = Math.max(...aggregated.map((a) => a.totalOrders))
  const maxMargin = Math.max(...aggregated.map((a) => a.avgMarginRate))
  const maxDailyRevenue = Math.max(...aggregated.map((a) => a.avgDailyRevenue))

  // 4단계: 성과 점수 계산
  return aggregated.map((item) => ({
    ...item,
    performanceScore: Math.round(
      normalize(item.totalRevenue, maxRevenue) * WEIGHTS.REVENUE +
        normalize(item.totalOrders, maxOrders) * WEIGHTS.ORDERS +
        normalize(item.avgMarginRate, maxMargin) * WEIGHTS.MARGIN +
        normalize(item.avgDailyRevenue, maxDailyRevenue) * WEIGHTS.DAILY_REVENUE,
    ),
  }))
}

/**
 * 카테고리 성과를 점수 내림차순으로 정렬
 *
 * @param performances 카테고리 성과 배열
 * @returns 점수 내림차순 정렬된 새 배열
 */
export function rankCategories(
  performances: readonly CategoryPerformance[],
): readonly CategoryPerformance[] {
  return [...performances].sort((a, b) => b.performanceScore - a.performanceScore)
}

/**
 * 상위 N개 추천 카테고리 반환
 *
 * @param performances 카테고리 성과 배열
 * @param topN 반환할 개수
 * @returns 점수 내림차순 상위 N개
 */
export function getRecommendedCategories(
  performances: readonly CategoryPerformance[],
  topN: number,
): readonly CategoryPerformance[] {
  return rankCategories(performances).slice(0, topN)
}
