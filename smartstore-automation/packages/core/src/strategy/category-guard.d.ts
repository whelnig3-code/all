/**
 * 해당 계정에서 카테고리 등록이 허용되는지 검사
 *
 * @param accountId 운영 계정 ID (ENV ACCOUNT_ID)
 * @param category  상품 카테고리명 (Product.category)
 * @returns true: 등록 허용 / false: 차단
 */
/**
 * 계정에 허용된 카테고리 목록 반환
 * 크롤링 단계에서 수집 대상 카테고리를 제한하는 데 사용
 *
 * @param accountId 운영 계정 ID
 * @returns 허용 카테고리명 배열
 */
export declare function getAllowedCategories(accountId: string): string[];
export declare function isCategoryAllowed(accountId: string, category: string): boolean;
export type SellerType = 'individual' | 'business';
/**
 * 셀러 유형에 따라 카테고리 등록이 허용되는지 검사
 *
 * - 사업자(business): 모든 카테고리 허용
 * - 개인(individual): 사업자 전용 카테고리 차단 (부분 매칭)
 *
 * @param category   상품 카테고리명
 * @param sellerType 셀러 유형 ('individual' | 'business')
 * @returns true: 등록 허용 / false: 차단
 */
export declare function isCategoryAllowedForSellerType(category: string, sellerType: SellerType): boolean;
//# sourceMappingURL=category-guard.d.ts.map