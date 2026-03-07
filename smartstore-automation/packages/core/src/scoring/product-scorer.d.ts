/** 등록 허용 최소 점수 */
export declare const SCORE_THRESHOLD = 75;
export interface ProductScoreInput {
    /** 실제 마진율 (0~1) — calculateWholesalePrice 반환값 */
    marginRate: number;
    /** 경쟁사 수 (기본값: 0) */
    competitorCount?: number;
    /** 우리 판매가 (원) */
    ourPrice?: number;
    /** 최저 경쟁가 (원, 없으면 중립 점수 적용) */
    lowestCompetitorPrice?: number;
    /** 공급처 리뷰 수 (기본값: 0) */
    sourceReviewCount?: number;
    /** 네이버 카테고리 ID 보유 여부 */
    hasNaverCategory: boolean;
}
export interface ProductScoreResult {
    /** 총 점수 (0~100) */
    totalScore: number;
    /** 항목별 세부 점수 */
    breakdown: {
        margin: number;
        competitors: number;
        priceDiff: number;
        reviews: number;
        category: number;
    };
    /** 등록 허용 여부 (totalScore >= SCORE_THRESHOLD) */
    shouldRegister: boolean;
    /** 차단 사유 (shouldRegister = false인 경우에만 설정) */
    blockedReason?: string;
}
/**
 * 상품 등록 적합성 종합 점수 계산
 *
 * @param input 스코어링 입력 파라미터
 * @returns 총 점수, 항목별 세부 점수, 등록 허용 여부
 */
export declare function calculateProductScore(input: ProductScoreInput): ProductScoreResult;
//# sourceMappingURL=product-scorer.d.ts.map