// =============================================
// 이상 탐지기 (Phase C-3)
//
// 비유: 건물 화재 감지기. 연기(이상 징후)가 나면
// 경보를 울려 빠르게 대응하게 한다.
//
// 매일 전일 대비 주요 지표를 비교하여
// 급격한 변동이 있으면 텔레그램 알림 트리거.
// =============================================

export interface DailyMetrics {
  readonly revenue: number
  readonly orders: number
  readonly avgMarginRate: number
  readonly returns: number
  readonly stockLevel: number
}

export interface Anomaly {
  readonly type: 'revenue_drop' | 'margin_drop' | 'high_returns' | 'stock_drop' | 'order_drop'
  readonly severity: 'warning' | 'critical'
  readonly message: string
  readonly currentValue: number
  readonly previousValue: number
}

export interface AnomalyResult {
  readonly hasAnomaly: boolean
  readonly anomalies: readonly Anomaly[]
}

/** 이상 탐지 임계값 */
const THRESHOLDS = {
  /** 매출 하락률 (50% 이상 하락 시 경보) */
  REVENUE_DROP: 0.50,
  /** 마진율 하락 (5%p 이상 하락 시 경보) */
  MARGIN_DROP: 0.05,
  /** 반품 건수 (3건 이상 시 경보) */
  HIGH_RETURNS: 3,
  /** 재고 감소율 (80% 이상 감소 시 경보) */
  STOCK_DROP: 0.80,
} as const

/**
 * 전일 대비 이상 탐지
 *
 * @param today 오늘 지표
 * @param previous 전일(또는 평균) 지표
 */
export function detectAnomalies(today: DailyMetrics, previous: DailyMetrics): AnomalyResult {
  const anomalies: Anomaly[] = []

  // 이전 데이터가 0이면 비교 불가 → 이상 없음
  if (previous.revenue === 0 && previous.orders === 0) {
    return { hasAnomaly: false, anomalies: [] }
  }

  // 1. 매출 급락
  if (previous.revenue > 0) {
    const dropRate = (previous.revenue - today.revenue) / previous.revenue
    if (dropRate >= THRESHOLDS.REVENUE_DROP) {
      anomalies.push({
        type: 'revenue_drop',
        severity: dropRate >= 0.8 ? 'critical' : 'warning',
        message: `매출 ${(dropRate * 100).toFixed(0)}% 하락 (${previous.revenue.toLocaleString()}원 → ${today.revenue.toLocaleString()}원)`,
        currentValue: today.revenue,
        previousValue: previous.revenue,
      })
    }
  }

  // 2. 마진율 급락
  if (previous.avgMarginRate > 0) {
    const marginDrop = previous.avgMarginRate - today.avgMarginRate
    if (marginDrop >= THRESHOLDS.MARGIN_DROP) {
      anomalies.push({
        type: 'margin_drop',
        severity: marginDrop >= 0.10 ? 'critical' : 'warning',
        message: `평균 마진율 ${(marginDrop * 100).toFixed(1)}%p 하락 (${(previous.avgMarginRate * 100).toFixed(1)}% → ${(today.avgMarginRate * 100).toFixed(1)}%)`,
        currentValue: today.avgMarginRate,
        previousValue: previous.avgMarginRate,
      })
    }
  }

  // 3. 반품 급증
  if (today.returns >= THRESHOLDS.HIGH_RETURNS) {
    anomalies.push({
      type: 'high_returns',
      severity: today.returns >= 5 ? 'critical' : 'warning',
      message: `반품 ${today.returns}건 발생 (전일 ${previous.returns}건)`,
      currentValue: today.returns,
      previousValue: previous.returns,
    })
  }

  // 4. 재고 급감
  if (previous.stockLevel > 0) {
    const stockDrop = (previous.stockLevel - today.stockLevel) / previous.stockLevel
    if (stockDrop >= THRESHOLDS.STOCK_DROP) {
      anomalies.push({
        type: 'stock_drop',
        severity: 'critical',
        message: `재고 ${(stockDrop * 100).toFixed(0)}% 감소 (${previous.stockLevel}개 → ${today.stockLevel}개)`,
        currentValue: today.stockLevel,
        previousValue: previous.stockLevel,
      })
    }
  }

  return {
    hasAnomaly: anomalies.length > 0,
    anomalies,
  }
}
