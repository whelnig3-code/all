/** 최소 마진율: 15% (이 값을 낮추지 말 것) */
export declare const MIN_MARGIN_RATE = 0.15;
/** 최대 마진율: 80% (비현실적 가격 방지) */
export declare const MAX_MARGIN_RATE = 0.8;
/** 최소 판매가: 100원 */
export declare const MIN_SALE_PRICE = 100;
/** 최대 판매가: 10,000,000원 (천만원) */
export declare const MAX_SALE_PRICE = 10000000;
/** 마진율 안전 검증 */
export declare function validateMarginRate(rate: number): void;
/** 판매가 안전 검증 */
export declare function validateSalePrice(price: number): void;
/** 도매가 안전 검증 */
export declare function validateWholesalePrice(price: number): void;
//# sourceMappingURL=guards.d.ts.map