import type { WholesalePriceInput, PriceCalculationResult } from '@smartstore/shared';
/**
 * 10원 단위로 올림 (네이버 가격 정책)
 */
export declare function ceilTo10(value: number): number;
/**
 * 위탁판매 판매가 계산
 *
 * 예시:
 *   도매가 10,000원 + 배송비 2,500원
 *   네이버 수수료 5%, 목표 마진 30%
 *   → 19,240원
 */
export declare function calculateWholesalePrice(input: WholesalePriceInput): PriceCalculationResult;
/**
 * 여러 마진율로 가격 시뮬레이션
 */
export declare function simulatePrices(wholesalePrice: number, shippingFee: number, naverFeeRate: number, marginRates: number[]): Array<PriceCalculationResult & {
    targetMarginRate: number;
}>;
//# sourceMappingURL=wholesale.d.ts.map