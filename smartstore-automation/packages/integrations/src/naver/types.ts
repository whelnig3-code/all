// =============================================
// 네이버 커머스 API 타입 정의
// =============================================

/** 네이버 커머스 API 응답 기본 구조 */
export interface NaverApiResponse<T> {
  resultCode: string
  resultMessage: string
  contents?: T
}

/** 상품 등록 요청 */
export interface NaverProductRegisterRequest {
  originProductNo?: number       // 수정 시 기존 상품번호
  smartstoreChannelProductNo?: number
  detailAttributeAfterProductNo?: number

  // 기본 정보
  name: string
  statusType: 'SALE' | 'SUSPENSION' | 'PROHIBITION'
  saleType: 'NEW' | 'USED'
  leafCategoryId: string

  // 가격
  salePrice: number
  stockQuantity: number

  // 배송
  deliveryInfo: {
    deliveryType: string
    deliveryAttributeType: string
    deliveryFee?: {
      deliveryFeeType: string
      baseFee: number
    }
  }

  // 이미지
  images?: {
    representativeImage: { url: string }
    optionalImages?: Array<{ url: string }>
  }

  // 상세 설명
  detailContent?: string

  // 옵션
  optionInfo?: NaverProductOptionInfo
}

/** 상품 옵션 정보 */
export interface NaverProductOptionInfo {
  optionCombinationGroupNames: {
    optionGroupName1?: string
    optionGroupName2?: string
    optionGroupName3?: string
  }
  optionCombinations: Array<{
    id?: number
    optionName1?: string
    optionName2?: string
    optionName3?: string
    stockQuantity: number
    price: number
    sellerManagerCode?: string
  }>
}

/** 상품 등록 응답 */
export interface NaverProductRegisterResponse {
  originProductNo: number        // 원상품번호
  smartstoreChannelProductNo: number  // 스마트스토어 채널상품번호
}

/** 주문 목록 조회 요청 */
export interface NaverOrderListRequest {
  page?: number
  size?: number
  orderType?: 'GENERAL_ORDER'
  productOrderStatuses?: string[]
  placedFrom?: string            // ISO 날짜 (주문 시작일)
  placedTo?: string              // ISO 날짜 (주문 종료일)
}

/** 주문 아이템 */
export interface NaverOrderItem {
  productOrderId: string         // 상품 주문 ID
  orderId: string                // 주문 ID
  productId: string              // 상품 ID
  productName: string
  quantity: number
  salePrice: number
  productOrderStatus: string     // 주문 상태
  deliveryStatus: string

  // 배송 정보
  shippingAddress?: {
    name: string
    tel: string
    zipCode: string
    baseAddress: string
    detailAddress: string
  }

  // 배송 추적
  trackingNumber?: string
  logisticsCompanyCode?: string

  // 타임스탬프
  orderDate: string
  paymentDate?: string
  shippingDate?: string
}

/** 주문 목록 응답 */
export interface NaverOrderListResponse {
  data: NaverOrderItem[]
  total: number
  page: number
  size: number
}

/** 발송 처리 요청 */
export interface NaverShippingRequest {
  dispatchProductOrders: Array<{
    productOrderId: string
    deliveryMethod: string       // 'DELIVERY'
    deliveryCompanyCode: string  // 택배사 코드
    trackingNumber: string
  }>
}

/** 가격 변경 요청 */
export interface NaverPriceUpdateRequest {
  originProductNo: number
  salePrice: number
}

/** 취소 승인 요청 */
export interface NaverCancelApproveRequest {
  productOrderId: string
  cancelReason?: string
}

/** 취소 거절 요청 */
export interface NaverCancelRejectRequest {
  productOrderId: string
  rejectReason: string
}

/** 반품 승인 요청 */
export interface NaverReturnApproveRequest {
  productOrderId: string
  returnReason?: string
}

/** 반품 거절 요청 */
export interface NaverReturnRejectRequest {
  productOrderId: string
  rejectReason: string
}

/** OAuth 토큰 응답 */
export interface NaverTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}
