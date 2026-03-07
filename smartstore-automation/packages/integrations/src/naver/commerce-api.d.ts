import type { NaverProductRegisterRequest, NaverProductRegisterResponse, NaverOrderListRequest, NaverOrderListResponse, NaverShippingRequest, NaverPriceUpdateRequest, NaverCancelApproveRequest, NaverCancelRejectRequest, NaverReturnApproveRequest, NaverReturnRejectRequest } from './types';
/** 네이버 커머스 API 클라이언트 */
export declare class NaverCommerceApiClient {
    private readonly clientId;
    private readonly clientSecret;
    private readonly shopId;
    private readonly baseUrl;
    private readonly client;
    private accessToken;
    private tokenExpiresAt;
    constructor(clientId?: string, clientSecret?: string, shopId?: string, baseUrl?: string);
    /**
     * 액세스 토큰 발급 또는 캐시된 토큰 반환
     * 만료 5분 전에 자동 갱신
     */
    private getAccessToken;
    /**
     * HMAC-SHA256 서명 생성
     * 네이버 커머스 API 인증 방식
     */
    private generateSignature;
    /**
     * 상품 등록
     * Rate limit: 초당 1건 이하 (CLAUDE.md 필수 규칙)
     */
    registerProduct(data: NaverProductRegisterRequest): Promise<NaverProductRegisterResponse>;
    /**
     * 상품 수정
     */
    updateProduct(originProductNo: number, data: Partial<NaverProductRegisterRequest>): Promise<void>;
    /**
     * 판매가 변경
     */
    updatePrice(data: NaverPriceUpdateRequest): Promise<void>;
    /**
     * 상품 일시 정지
     */
    suspendProduct(originProductNo: number): Promise<void>;
    /**
     * 주문 목록 조회
     * 기본값: 최근 결제 완료 주문
     */
    getOrders(params?: NaverOrderListRequest): Promise<NaverOrderListResponse>;
    /**
     * 새 주문 조회 (결제 완료 상태만)
     */
    getNewOrders(): Promise<NaverOrderListResponse>;
    /**
     * 발송 처리 (운송장 등록)
     */
    confirmShipping(data: NaverShippingRequest): Promise<void>;
    /**
     * 취소 승인
     */
    approveCancel(data: NaverCancelApproveRequest): Promise<void>;
    /**
     * 취소 거절
     */
    rejectCancel(data: NaverCancelRejectRequest): Promise<void>;
    /**
     * 반품 승인
     */
    approveReturn(data: NaverReturnApproveRequest): Promise<void>;
    /**
     * 반품 거절
     */
    rejectReturn(data: NaverReturnRejectRequest): Promise<void>;
    /**
     * API 연결 테스트
     */
    healthCheck(): Promise<boolean>;
}
export declare const naverCommerceApi: NaverCommerceApiClient;
//# sourceMappingURL=commerce-api.d.ts.map