// =============================================
// 가격 변동 안전장치 (Phase A-2)
//
// 비유: 자동차의 급제동 방지 장치(ABS).
// 가격이 급락하면 "정말 이게 맞나?" 한 번 멈추고 확인한다.
// 경쟁가 크롤링 오류로 인한 비정상 가격 변동을 차단.
//
// 규칙:
//   - 1회 최대 10% 하락 (상승은 제한 없음)
//   - 1일 최대 2회 변경
//   - dry-run: 로그만 남기고 실제 변경 안 함
// =============================================

/** 기본 설정 */
const DEFAULT_MAX_DROP_RATE = 0.10    // 1회 최대 10% 하락
const DEFAULT_MAX_CHANGES_PER_DAY = 2 // 1일 최대 2회

export interface PriceChangeInput {
  readonly currentPrice: number
  readonly newPrice: number
  readonly changesLast24h: number
  readonly dryRun?: boolean
  readonly maxDropRate?: number
  readonly maxChangesPerDay?: number
}

export interface PriceChangeResult {
  readonly allowed: boolean
  readonly reason?: string
  readonly dryRun?: boolean
  /** dry-run일 때: 실제 모드였으면 허용됐을지 여부 */
  readonly wouldAllow?: boolean
  readonly dropRate?: number
}

/**
 * 가격 변동 허용 여부 판단
 */
export function isPriceChangeAllowed(input: PriceChangeInput): PriceChangeResult {
  const {
    currentPrice,
    newPrice,
    changesLast24h,
    dryRun = false,
    maxDropRate = DEFAULT_MAX_DROP_RATE,
    maxChangesPerDay = DEFAULT_MAX_CHANGES_PER_DAY,
  } = input

  // 가격 변동률 계산
  const changeRate = (currentPrice - newPrice) / currentPrice
  const isDropping = newPrice < currentPrice

  // 1. 과도한 하락 체크
  if (isDropping && changeRate > maxDropRate) {
    const reason = `1회 최대 하락 ${(maxDropRate * 100).toFixed(0)}% 초과: ${(changeRate * 100).toFixed(1)}% 하락 시도`

    if (dryRun) {
      return { allowed: false, dryRun: true, wouldAllow: false, reason, dropRate: changeRate }
    }
    return { allowed: false, reason, dropRate: changeRate }
  }

  // 2. 일일 변동 횟수 체크
  if (changesLast24h >= maxChangesPerDay) {
    const reason = `1일 최대 ${maxChangesPerDay}회 변경 초과: 이미 ${changesLast24h}회 변경됨`

    if (dryRun) {
      return { allowed: false, dryRun: true, wouldAllow: false, reason }
    }
    return { allowed: false, reason }
  }

  // 3. dry-run 모드 → 허용이지만 실제 변경은 하지 않음
  if (dryRun) {
    return {
      allowed: false,
      dryRun: true,
      wouldAllow: true,
      reason: 'dry-run 모드 — 실제 변경 없음',
      dropRate: isDropping ? changeRate : undefined,
    }
  }

  // 4. 정상 허용
  return {
    allowed: true,
    dropRate: isDropping ? changeRate : undefined,
  }
}
