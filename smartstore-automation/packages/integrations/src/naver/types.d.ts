/** 네이버 커머스 API 응답 기본 구조 */
export interface NaverApiResponse<T> {
    resultCode: string;
    resultMessage: string;
    contents?: T;
}
/** 상품 등록 요청 */
export interface NaverProductRegisterRequest {
    originProductNo?: number;
    smartstoreChannelProductNo?: number;
    detailAttributeAfterProductNo?: number;
    name: string;
    statusType: 'SALE' | 'SUSPENSION' | 'PROHIBITION';
    saleType: 'NEW' | 'USED';
    leafCategoryId: string;
    salePrice: number;
    stockQuantity: number;
    deliveryInfo: {
        deliveryType: string;
        deliveryAttributeType: string;
        deliveryFee?: {
            deliveryFeeType: string;
            baseFee: number;
        };
    };
    images?: {
        representativeImage: {
            url: string;
        };
        optionalImages?: Array<{
            url: string;
        }>;
    };
    detailContent?: string;
    optionInfo?: NaverProductOptionInfo;
}
/** 상품 옵션 정보 */
export interface NaverProductOptionInfo {
    optionCombinationGroupNames: {
        optionGroupName1?: string;
        optionGroupName2?: string;
        optionGroupName3?: string;
    };
    optionCombinations: Array<{
        id?: number;
        optionName1?: string;
        optionName2?: string;
        optionName3?: string;
        stockQuantity: number;
        price: number;
        sellerManagerCode?: string;
    }>;
}
/** 상품 등록 응답 */
export interface NaverProductRegisterResponse {
    originProductNo: number;
    smartstoreChannelProductNo: number;
}
/** 주문 목록 조회 요청 */
export interface NaverOrderListRequest {
    page?: number;
    size?: number;
    orderType?: 'GENERAL_ORDER';
    productOrderStatuses?: string[];
    placedFrom?: string;
    placedTo?: string;
}
/** 주문 아이템 */
export interface NaverOrderItem {
    productOrderId: string;
    orderId: string;
    productId: string;
    productName: string;
    quantity: number;
    salePrice: number;
    productOrderStatus: string;
    deliveryStatus: string;
    shippingAddress?: {
        name: string;
        tel: string;
        zipCode: string;
        baseAddress: string;
        detailAddress: string;
    };
    trackingNumber?: string;
    logisticsCompanyCode?: string;
    orderDate: string;
    paymentDate?: string;
    shippingDate?: string;
}
/** 주문 목록 응답 */
export interface NaverOrderListResponse {
    data: NaverOrderItem[];
    total: number;
    page: number;
    size: number;
}
/** 발송 처리 요청 */
export interface NaverShippingRequest {
    dispatchProductOrders: Array<{
        productOrderId: string;
        deliveryMethod: string;
        deliveryCompanyCode: string;
        trackingNumber: string;
    }>;
}
/** 가격 변경 요청 */
export interface NaverPriceUpdateRequest {
    originProductNo: number;
    salePrice: number;
}
/** 취소 승인 요청 */
export interface NaverCancelApproveRequest {
    productOrderId: string;
    cancelReason?: string;
}
/** 취소 거절 요청 */
export interface NaverCancelRejectRequest {
    productOrderId: string;
    rejectReason: string;
}
/** 반품 승인 요청 */
export interface NaverReturnApproveRequest {
    productOrderId: string;
    returnReason?: string;
}
/** 반품 거절 요청 */
export interface NaverReturnRejectRequest {
    productOrderId: string;
    rejectReason: string;
}
/** OAuth 토큰 응답 */
export interface NaverTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
}
//# sourceMappingURL=types.d.ts.map