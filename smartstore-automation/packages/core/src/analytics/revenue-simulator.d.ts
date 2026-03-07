export interface SimulationOrder {
    /** 실제 마진 금액 (원, null이면 해당 주문 제외) */
    marginAmount?: number | null;
    /** 판매가 (마진율 계산에 사용) */
    salePrice: number;
    /** 주문 일시 (기간 추정에 사용) */
    orderedAt: Date;
}
export interface MonthlyRevenueSummary {
    /** 총 주문 수 */
    totalOrders: number;
    /** 총 마진 금액 (원) */
    totalMarginAmount: number;
    /** 평균 마진율 (0~1) */
    avgMarginRate: number;
    /** 30일 환산 예상 월 수익 (원) */
    projectedMonthlyRevenue: number;
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
export declare function simulateMonthlyRevenue(orders: SimulationOrder[]): MonthlyRevenueSummary;
//# sourceMappingURL=revenue-simulator.d.ts.map