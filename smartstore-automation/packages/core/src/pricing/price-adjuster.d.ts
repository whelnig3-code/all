/** 가격 조정 입력 파라미터 */
export interface PriceAdjustInput {
    /** 도매가 (원) */
    wholesalePrice: number;
    /** 배송비 (원) */
    shippingFee: number;
    /** 네이버 수수료율 (예: 0.05 = 5%) */
    naverFeeRate: number;
    /** 목표 마진율 (예: 0.30 = 30%) */
    targetMarginRate: number;
    /** 경쟁사 최저가 (원) */
    lowestCompetitorPrice: number;
    /** 경쟁가 언더컷 금액 — 기본 10원 */
    undercutAmount?: number;
    /** 이 비율 미만 변동은 무시 — 기본 1% */
    minChangeRatio?: number;
}
/** 가격 조정 결과 */
export interface PriceAdjustResult {
    /** 가격 변경 여부 */
    shouldAdjust: boolean;
    /** 새 판매가 (shouldAdjust=false 이면 현재가 그대로) */
    newPrice: number;
    /** 조정 사유 (로그·알림용) */
    reason: string;
    /**
     * 마진 안전장치(MIN_MARGIN_RATE 15%)에 의해 언더컷 가격이 차단된 경우 true
     * true여도 shouldAdjust=true일 수 있음 (최소 마진가로 조정되는 경우)
     */
    blockedByMarginGuard: boolean;
}
/**
 * 경쟁가 기반 최적 판매가 계산
 *
 * @param currentPrice 현재 판매가 (원)
 * @param input 조정 파라미터
 * @returns PriceAdjustResult
 */
export declare function adjustPrice(currentPrice: number, input: PriceAdjustInput): PriceAdjustResult;
//# sourceMappingURL=price-adjuster.d.ts.map