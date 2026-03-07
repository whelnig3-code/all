import type { NaverProduct } from '@smartstore/shared';
/** 상품 등록 결과 */
export interface ProductRegistrationResult {
    success: boolean;
    originProductNo?: number;
    smartstoreChannelProductNo?: number;
    error?: string;
}
/**
 * 단일 상품 네이버 등록
 * Rate limit: 1건 등록 후 1초 대기
 */
export declare function registerProductToNaver(product: NaverProduct): Promise<ProductRegistrationResult>;
/**
 * 상품 배치 등록 (목록 전체)
 * Rate limit: 각 등록 사이 1초 간격 자동 적용
 */
export declare function registerProductsBatch(products: NaverProduct[]): Promise<ProductRegistrationResult[]>;
/**
 * 상품 설명 업데이트 (콘텐츠 자동 생성 후 호출)
 * @returns 성공 여부
 */
export declare function updateProductDescription(originProductNo: number, description: string): Promise<boolean>;
/**
 * 상품 가격 업데이트
 */
export declare function updateProductPrice(originProductNo: number, newPrice: number): Promise<boolean>;
//# sourceMappingURL=product.d.ts.map