export type ProductType = 'stable' | 'growth' | 'experimental';
/**
 * 계정별 목표 비율 (Phase 3 기준)
 * - stable: 안정적 마진, 60%
 * - growth: 성장 가능, 30%
 * - experimental: 고마진 실험, 10%
 */
export declare const TARGET_RATIOS: Record<ProductType, number>;
/**
 * 전체 등록 수 기준 포트폴리오 Phase 반환
 * - Phase 1: 소규모 (< 20) — 절대 수 제한
 * - Phase 2: 성장기 (20~49) — 완화된 비율 제한
 * - Phase 3: 안정기 (≥ 50) — 목표 비율 전면 적용
 */
export declare function getPortfolioPhase(totalCount: number): 1 | 2 | 3;
/**
 * 마진율 기준 상품 유형 분류
 * - marginRate >= 35% → experimental
 * - 25~35% 미만  → growth
 * - 20~25% 미만  → stable
 */
export declare function classifyProductType(marginRate: number): ProductType;
/**
 * 해당 유형의 등록이 제한을 초과했는지 Phase별로 검사
 *
 * @param productType 등록하려는 상품 유형
 * @param typeCount   현재 계정의 해당 유형 등록 수
 * @param totalCount  현재 계정의 전체 등록 수
 * @returns true: 제한 초과 (차단) / false: 허용
 */
export declare function isPortfolioRatioExceeded(productType: ProductType, typeCount: number, totalCount: number): boolean;
//# sourceMappingURL=portfolio-guard.d.ts.map