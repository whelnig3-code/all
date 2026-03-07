// =============================================
// 월 수익 시뮬레이터
// 주문 데이터의 marginAmount를 집계하여
// 월 500만원 목표 달성 여부를 시뮬레이션
// =============================================

export interface SimulationOrder {
  /** 실제 마진 금액 (원, null이면 해당 주문 제외) */
  marginAmount?: number | null
  /** 판매가 (마진율 계산에 사용) */
  salePrice: number
  /** 주문 일시 (기간 추정에 사용) */
  orderedAt: Date
}

export interface MonthlyRevenueSummary {
  /** 총 주문 수 */
  totalOrders: number
  /** 총 마진 금액 (원) */
  totalMarginAmount: number
  /** 평균 마진율 (0~1) */
  avgMarginRate: number
  /** 30일 환산 예상 월 수익 (원) */
  projectedMonthlyRevenue: number
}

/**
 * 주문 배열을 기반으로 월 수익을 시뮬레이션
 *
 * - marginAmount가 null/undefined인 주문은 금액 집계에서 제외
 * - 데이터 기간이 1일 미만이면 1일로 보정 후 ×30
 *
 * @param orders 주문 배열
 * @returns 월 수익 요약
 */
export function simulateMonthlyRevenue(
  orders: SimulationOrder[]
): MonthlyRevenueSummary {
  if (orders.length === 0) {
    return { totalOrders: 0, totalMarginAmount: 0, avgMarginRate: 0, projectedMonthlyRevenue: 0 }
  }

  // marginAmount가 숫자인 주문만 집계
  const validOrders = orders.filter(
    (o): o is SimulationOrder & { marginAmount: number } =>
      typeof o.marginAmount === 'number'
  )

  const totalMarginAmount = validOrders.reduce((sum, o) => sum + o.marginAmount, 0)

  // 평균 마진율: 각 주문의 (marginAmount / salePrice) 평균
  const avgMarginRate =
    validOrders.length > 0
      ? validOrders.reduce(
          (sum, o) => sum + (o.salePrice > 0 ? o.marginAmount / o.salePrice : 0),
          0
        ) / validOrders.length
      : 0

  // 데이터 기간 계산 → 30일 기준 월 수익 추정
  const timestamps = orders.map((o) => o.orderedAt.getTime())
  const periodDays = Math.max(
    1,
    (Math.max(...timestamps) - Math.min(...timestamps)) / (1000 * 60 * 60 * 24)
  )
  const projectedMonthlyRevenue = Math.round((totalMarginAmount / periodDays) * 30)

  return {
    totalOrders: orders.length,
    totalMarginAmount: Math.round(totalMarginAmount),
    avgMarginRate: parseFloat(avgMarginRate.toFixed(4)),
    projectedMonthlyRevenue,
  }
}
