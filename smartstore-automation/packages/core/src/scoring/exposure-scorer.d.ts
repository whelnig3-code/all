/** 노출 가능성 점수 하한 — 미달 시 등록 제외 */
export declare const EXPOSURE_SCORE_THRESHOLD = 60;
/** 노출 가능성 점수 입력 */
export interface ExposureScoreInput {
    /** 광고 상품 수 (fetchTop20Products 반환값) */
    adCount: number;
    /** 상위 상품 평균 리뷰 수 */
    avgReview: number;
    /** 상위 10개 중 브랜드 상품 수 (0~10) */
    brandCountTop10: number;
    /** 상위 상품 평균 가격 (원, 0이면 중립 처리) */
    avgTopPrice: number;
    /** 우리 판매가 (원) */
    myPrice: number;
}
/**
 * 노출 가능성 종합 점수 계산 (0~100)
 *
 * @param input 스코어링 입력 (fetchTop20Products 결과 + myPrice)
 * @returns 0~100 점수 (EXPOSURE_SCORE_THRESHOLD = 60)
 *
 * @example
 * const score = calculateExposureScore({
 *   adCount: 3, avgReview: 120, brandCountTop10: 2,
 *   avgTopPrice: 25000, myPrice: 22000,
 * })
 * // → 74 (통과)
 */
export declare function calculateExposureScore(input: ExposureScoreInput): number;
//# sourceMappingURL=exposure-scorer.d.ts.map