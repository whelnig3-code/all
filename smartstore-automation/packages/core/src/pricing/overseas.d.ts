/** 구매대행 가격 계산 입력 */
export interface OverseasPriceParams {
    /** 해외 원가 (외화 단위 — USD 또는 CNY) */
    overseasPrice: number;
    /** 통화 — 계산 공식은 통화에 무관하나, 감사/기록 목적으로 보존 */
    currency: 'USD' | 'CNY';
    /** 적용 환율 (1외화 당 원화, 예: 1300) */
    exchangeRate: number;
    /** 해외 배송비 (원) */
    overseasShipFee: number;
    /** 관세율 (0~1, 예: 0.10 = 10%) */
    customsRate: number;
    /** 국내 택배비 (원) */
    domesticShipFee: number;
    /** 네이버 수수료율 (0~1) */
    naverFeeRate: number;
    /** 목표 마진율 (0~1) */
    targetMarginRate: number;
}
/** 비용 내역 */
export interface OverseasCostBreakdown {
    /** 해외원가 × 환율 (원) */
    overseasCost: number;
    /** 해외 배송비 (원) */
    overseasShipFee: number;
    /** 관세 = overseasCost × customsRate (원) */
    customs: number;
    /** 부가세 = (overseasCost + customs) × 10% (원) */
    vat: number;
    /** 국내 택배비 (원) */
    domesticShipFee: number;
    /** 총 원가 = overseasCost + overseasShipFee + customs + vat + domesticShipFee (원) */
    totalCost: number;
}
/** 구매대행 가격 계산 결과 */
export interface OverseasPriceResult {
    /** 최종 판매가 (10원 단위 올림, 원) */
    salePrice: number;
    /** 실제 마진율 (0~1) */
    marginRate: number;
    /** 비용 내역 */
    costBreakdown: OverseasCostBreakdown;
}
/**
 * 구매대행 판매가 계산
 *
 * 예시 (CLAUDE.md 기준):
 *   overseasPrice=2.50, currency='USD', exchangeRate=1200,
 *   overseasShipFee=1000, customsRate=0.10, domesticShipFee=3000,
 *   naverFeeRate=0.05, targetMarginRate=0.30
 *   → salePrice=11,740원
 *
 * @throws 마진율이 15% 미만이면 Error
 */
export declare function calculateOverseasPrice(params: OverseasPriceParams): OverseasPriceResult;
//# sourceMappingURL=overseas.d.ts.map