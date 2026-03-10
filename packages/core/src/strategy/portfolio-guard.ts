// =============================================
// 포트폴리오 비율 제어
// 계정당 상품 유형 비율(stable/growth/experimental)을
// 자동 유지하도록 등록 전 비율 초과 여부를 검사
//
// Phase별 규칙:
//   Phase 1 (< 20개) : 절대 수 제한 (초기 왜곡 방지)
//   Phase 2 (20~49개): 완화된 비율 제한
//   Phase 3 (≥ 50개) : TARGET_RATIOS 전면 적용
// =============================================

export type ProductType = 'stable' | 'growth' | 'experimental'

/**
 * 계정별 목표 비율 (Phase 3 기준)
 * - stable: 안정적 마진, 60%
 * - growth: 성장 가능, 30%
 * - experimental: 고마진 실험, 10%
 */
export const TARGET_RATIOS: Record<ProductType, number> = {
  stable:       0.60,
  growth:       0.30,
  experimental: 0.10,
}

/**
 * Phase 1 절대 수 상한 (총 20개 미만 구간)
 * - experimental: 최대 2개 (초기 집중 방지)
 * - growth: 최대 5개 (초기 집중 방지)
 * - stable: 제한 없음 (undefined)
 */
const PHASE1_MAX_COUNTS: Partial<Record<ProductType, number>> = {
  experimental: 2,
  growth:       5,
}

/**
 * Phase 2 비율 상한 (총 20~49개 구간, 완화 적용)
 * - experimental: 10%
 * - growth: 30%
 * - stable: 제한 없음 (undefined)
 */
const PHASE2_RATIOS: Partial<Record<ProductType, number>> = {
  experimental: 0.10,
  growth:       0.30,
}

/**
 * 전체 등록 수 기준 포트폴리오 Phase 반환
 * - Phase 1: 소규모 (< 20) — 절대 수 제한
 * - Phase 2: 성장기 (20~49) — 완화된 비율 제한
 * - Phase 3: 안정기 (≥ 50) — 목표 비율 전면 적용
 */
export function getPortfolioPhase(totalCount: number): 1 | 2 | 3 {
  if (totalCount < 20) return 1
  if (totalCount < 50) return 2
  return 3
}

/**
 * 마진율 기준 상품 유형 분류
 * - marginRate >= 35% → experimental
 * - 25~35% 미만  → growth
 * - 20~25% 미만  → stable
 */
export function classifyProductType(marginRate: number): ProductType {
  if (marginRate >= 0.35) return 'experimental'
  if (marginRate >= 0.25) return 'growth'
  return 'stable'
}

/**
 * 해당 유형의 등록이 제한을 초과했는지 Phase별로 검사
 *
 * @param productType 등록하려는 상품 유형
 * @param typeCount   현재 계정의 해당 유형 등록 수
 * @param totalCount  현재 계정의 전체 등록 수
 * @returns true: 제한 초과 (차단) / false: 허용
 */
export function isPortfolioRatioExceeded(
  productType: ProductType,
  typeCount: number,
  totalCount: number
): boolean {
  // 등록 상품이 없으면 첫 상품은 항상 허용
  if (totalCount === 0) return false

  const phase = getPortfolioPhase(totalCount)

  if (phase === 1) {
    // Phase 1: 절대 수 제한 (stable은 무제한)
    const maxCount = PHASE1_MAX_COUNTS[productType]
    if (maxCount === undefined) return false
    return typeCount >= maxCount
  }

  if (phase === 2) {
    // Phase 2: 완화된 비율 제한 (stable은 무제한)
    const maxRatio = PHASE2_RATIOS[productType]
    if (maxRatio === undefined) return false
    return typeCount / totalCount >= maxRatio
  }

  // Phase 3: 목표 비율 전면 적용
  return typeCount / totalCount >= TARGET_RATIOS[productType]
}
