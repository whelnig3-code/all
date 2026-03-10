// =============================================
// 등록 거부 분석기 (Phase A-3)
//
// 비유: 병원의 "거부 사유 통계표".
// "왜 환자(상품)가 입원(등록) 거부됐는지" 패턴을 파악하면
// 시스템을 개선할 수 있다.
//
// 사용: 대시보드에서 거부 트렌드 시각화
// =============================================

export interface JobLogEntry {
  readonly id: string
  readonly jobType: string
  readonly status: string
  readonly result: Record<string, unknown>
  readonly createdAt: Date
}

export interface RejectionAnalysis {
  /** 총 거부 건수 */
  readonly total: number
  /** 사유별 건수 */
  readonly byReason: Record<string, number>
  /** 사유별 비율 (%) */
  readonly byPercentage: Record<string, number>
  /** 상위 사유 (내림차순) */
  readonly topReasons: ReadonlyArray<{ reason: string; count: number; percentage: number }>
}

/**
 * 거부 로그 분석
 *
 * @param logs jobLog 배열 (DB에서 조회)
 * @returns 거부 사유 통계
 */
export function analyzeRejections(logs: readonly JobLogEntry[]): RejectionAnalysis {
  // skipped: true인 로그만 필터
  const rejections = logs.filter(
    (log) => log.result?.skipped === true && typeof log.result?.reason === 'string',
  )

  const total = rejections.length

  if (total === 0) {
    return { total: 0, byReason: {}, byPercentage: {}, topReasons: [] }
  }

  // 사유별 집계
  const byReason: Record<string, number> = {}
  for (const log of rejections) {
    const reason = log.result.reason as string
    byReason[reason] = (byReason[reason] ?? 0) + 1
  }

  // 비율 계산
  const byPercentage: Record<string, number> = {}
  for (const [reason, count] of Object.entries(byReason)) {
    byPercentage[reason] = Math.round((count / total) * 100)
  }

  // 상위 사유 정렬
  const topReasons = Object.entries(byReason)
    .map(([reason, count]) => ({
      reason,
      count,
      percentage: byPercentage[reason],
    }))
    .sort((a, b) => b.count - a.count)

  return { total, byReason, byPercentage, topReasons }
}
