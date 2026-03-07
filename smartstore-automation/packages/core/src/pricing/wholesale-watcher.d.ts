/** 기본 변동 임계값: 5% */
export declare const DEFAULT_CHANGE_THRESHOLD = 0.05;
/** 도매 원가 변동 감지 결과 */
export interface WholesalePriceChangeResult {
    /** 변동 여부 */
    changed: boolean;
    /** 이전 도매가 (원) */
    oldPrice: number;
    /** 신규 도매가 (원) */
    newPrice: number;
    /** 변화율 (양수=상승, 음수=하락) */
    changeRate: number;
    /** 마진율 위반 위험 여부 */
    marginRisk: boolean;
    /** 추정 신규 마진율 (임시 계산) */
    estimatedNewMarginRate: number | null;
}
/** 마진 위험 판단 파라미터 */
export interface MarginRiskParams {
    /** 신규 도매가 */
    newWholesalePrice: number;
    /** 배송비 */
    shippingFee: number;
    /** 네이버 수수료율 */
    naverFeeRate: number;
    /** 목표 마진율 */
    targetMarginRate: number;
    /** 현재 판매가 */
    currentSalePrice: number;
}
/**
 * 도매가 변화율 계산
 * @param oldPrice 이전 가격
 * @param newPrice 신규 가격
 * @returns 변화율 (예: 0.05 = 5% 상승, -0.03 = 3% 하락)
 */
export declare function calcPriceChangeRate(oldPrice: number, newPrice: number): number;
/**
 * 변동이 임계값 이상인지 확인 (절댓값 기준)
 * @param changeRate 변화율
 * @param threshold 임계값 (기본 0.05 = 5%)
 */
export declare function isSignificantChange(changeRate: number, threshold?: number): boolean;
/**
 * 도매 원가 상승 시 마진 위험 여부 판단
 * - 신규 도매가로 재계산 시 마진율이 MIN_MARGIN_RATE(15%) 미만이면 위험
 */
export declare function assessMarginRisk(params: MarginRiskParams): {
    risk: boolean;
    estimatedMarginRate: number | null;
};
/**
 * 도매 원가 변동 감지 메인 함수
 *
 * @param productId 상품 ID (로깅용)
 * @param oldPrice 기존 도매가 (DB)
 * @param newPrice 신규 도매가 (크롤링)
 * @param marginParams 마진 위험 판단 파라미터 (선택)
 * @param threshold 변동 임계값 (기본 5%)
 * @returns 변동 감지 결과
 */
export declare function detectWholesalePriceChange(productId: string, oldPrice: number, newPrice: number, marginParams?: MarginRiskParams, threshold?: number): WholesalePriceChangeResult;
//# sourceMappingURL=wholesale-watcher.d.ts.map