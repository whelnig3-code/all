// =============================================
// 공유 타입 정의 - 전체 모노레포에서 사용
// =============================================

// --- 상품 관련 타입 ---

/** 상품 소싱 타입 (위탁판매 / 구매대행) */
export type SourcingType = 'wholesale' | 'overseas'

/** 상품 상태 */
export type ProductStatus =
  | 'pending'      // 대기 중
  | 'registered'   // 네이버 등록 완료
  | 'active'       // 판매 중
  | 'suspended'    // 일시 정지
  | 'deleted'      // 삭제됨

/** 도매 공급처 */
export type WholesaleSource = 'domaegguk' | 'ownerclan'

/** 원시 크롤링 상품 데이터 */
export interface RawProduct {
  sourceId: string           // 공급처 상품 ID
  source: WholesaleSource
  name: string               // 상품명
  wholesalePrice: number     // 도매가 (원)
  shippingFee: number        // 배송비 (원)
  category: string           // 공급처 카테고리
  images: string[]           // 이미지 URL 목록
  options?: ProductOption[]  // 상품 옵션
  stockQuantity: number      // 재고 수량
  description?: string       // 상품 설명
}

/** 상품 옵션 */
export interface ProductOption {
  name: string    // 옵션명 (예: 색상)
  values: string[] // 옵션값 목록 (예: ['빨강', '파랑'])
}

/** 네이버 등록용 상품 데이터 */
export interface NaverProduct {
  id?: string                 // 네이버 상품 ID (등록 후 부여)
  name: string
  salePrice: number           // 판매가 (계산된 값)
  category: NaverCategory
  images: string[]
  description: string
  options?: NaverProductOption[]
  stockQuantity: number
  deliveryInfo: DeliveryInfo
}

/** 네이버 카테고리 */
export interface NaverCategory {
  id: string
  name: string
}

/** 네이버 상품 옵션 */
export interface NaverProductOption {
  groupName: string
  options: Array<{
    value: string
    price: number    // 옵션 추가 금액
    stockQuantity: number
  }>
}

/** 배송 정보 */
export interface DeliveryInfo {
  deliveryFee: number
  deliveryType: 'FREE' | 'PAID' | 'CONDITIONAL_FREE'
  minOrderAmountForFree?: number
}

// --- 주문 관련 타입 ---

/** 주문 상태 */
export type OrderStatus =
  | 'payment_waiting'   // 결제 대기
  | 'paid'              // 결제 완료
  | 'preparing'         // 발송 준비 중
  | 'shipped'           // 배송 중
  | 'delivered'         // 배송 완료
  | 'cancelled'         // 취소됨
  | 'return_requested'  // 반품 요청
  | 'returned'          // 반품 완료

/** 주문 데이터 */
export interface Order {
  orderId: string           // 네이버 주문 ID
  productId: string         // 내부 상품 ID
  naverProductId: string    // 네이버 상품 ID
  quantity: number
  salePrice: number         // 판매가
  status: OrderStatus
  customerName: string
  customerPhone: string     // @encrypted - 암호화 필수
  customerAddress: string
  orderedAt: Date
  paidAt?: Date
  shippedAt?: Date
  deliveredAt?: Date
  trackingNumber?: string   // 운송장 번호
  courier?: string          // 택배사
}

/** 발주 정보 (공급사에 전달) */
export interface PurchaseOrder {
  orderId: string
  source: WholesaleSource
  sourceProductId: string
  quantity: number
  shippingAddress: {
    name: string
    phone: string
    address: string
    zipCode: string
  }
}

// --- 가격 계산 관련 타입 ---

/** 위탁판매 가격 계산 입력값 */
export interface WholesalePriceInput {
  wholesalePrice: number    // 도매가
  shippingFee: number       // 배송비
  naverFeeRate: number      // 네이버 수수료율 (0.05 = 5%)
  targetMarginRate: number  // 목표 마진율 (0.30 = 30%)
}

/** 가격 계산 결과 */
export interface PriceCalculationResult {
  salePrice: number         // 최종 판매가
  cost: number              // 총 원가
  margin: number            // 마진 금액
  marginRate: number        // 실제 마진율
  naverFee: number          // 네이버 수수료
}

// --- 모니터링 관련 타입 ---

/** 경쟁 상품 가격 정보 */
export interface CompetitorPrice {
  productId: string
  naverProductId: string
  competitorName: string
  price: number
  rank?: number             // 검색 순위
  checkedAt: Date
}

/** 가격 조정 결과 */
export interface PriceAdjustmentResult {
  productId: string
  oldPrice: number
  newPrice: number
  reason: string
  adjustedAt: Date
}

// --- 알림 관련 타입 ---

/** 알림 유형 */
export type NotificationType =
  | 'order_received'         // 새 주문
  | 'order_shipped'          // 발송 완료
  | 'price_adjusted'         // 가격 조정
  | 'stock_low'              // 재고 부족
  | 'inventory_low'          // 재고 부족 경고 (SAFE_STOCK 이하)
  | 'inventory_out'          // 재고 소진 (0)
  | 'inventory_recovered'    // 재고 복구 (SAFE_STOCK 초과)
  | 'system_error'           // 시스템 오류
  | 'blog_posted'            // 블로그 포스팅 완료
  | 'content_generated'      // 콘텐츠 생성 완료
  | 'wholesale_price_changed' // 도매가 변동
  | 'order_approval_request'  // 주문 승인 요청
  | 'order_approved'          // 주문 승인됨
  | 'order_rejected'          // 주문 거부됨
  | 'order_approval_timeout'  // 주문 승인 타임아웃
  | 'product_registered'       // 상품 등록 완료
  | 'talktalk_urgent'         // 톡톡 긴급 고객 문의
  | `refund_${string}`        // 환불 관련 알림

/** 알림 메시지 */
export interface Notification {
  type: NotificationType
  title: string
  message: string
  data?: Record<string, unknown>
}

// --- 재고 관련 타입 ---

/** 재고 이벤트 유형 */
export type InventoryEventType =
  | 'sync'             // 공급처 동기화
  | 'reserve'          // 주문 예약
  | 'release'          // 예약 해제
  | 'pause'            // 판매 중지
  | 'resume'           // 판매 재개
  | 'order_decrement'  // 주문 확정 차감

/** 재고 예약 결과 */
export interface ReservationResult {
  productId: string
  reservedQty: number
  availableStock: number
  reservedStock: number
}

/** 재고 상태 조회용 */
export interface InventoryStatus {
  productId: string
  supplierStock: number
  cachedStock: number
  reservedStock: number
  availableStock: number
  sellableStock: number
  listingPaused: boolean
  lastStockSync: Date | null
  cacheFresh: boolean
}

// --- 승인 관련 타입 (Phase 4.5) ---

/** 승인 상태 */
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'timeout'

/** 승인 이벤트 액션 */
export type ApprovalAction =
  | 'created'
  | 'approved'
  | 'rejected'
  | 'timeout'
  | 'supplier_ordered'

// --- Result 타입 (에러 처리) ---

/** 성공/실패를 명시적으로 표현하는 Result 타입 */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E }

export const Ok = <T>(value: T): Result<T> => ({ ok: true, value })
export const Err = <E = Error>(error: E): Result<never, E> => ({ ok: false, error })
