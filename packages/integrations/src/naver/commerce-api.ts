// =============================================
// 네이버 커머스 API 클라이언트
// - OAuth 2.0 인증 (자동 토큰 갱신)
// - Rate limit 준수: 초당 1건 이하
// =============================================

import axios, { AxiosInstance, AxiosError } from 'axios'
import bcrypt from 'bcrypt'
import { config, createLogger } from '@smartstore/shared'
import type {
  NaverTokenResponse,
  NaverProductRegisterRequest,
  NaverProductRegisterResponse,
  NaverOrderListRequest,
  NaverOrderListResponse,
  NaverOrderItem,
  NaverShippingRequest,
  NaverPriceUpdateRequest,
  NaverCancelApproveRequest,
  NaverCancelRejectRequest,
  NaverReturnApproveRequest,
  NaverReturnRejectRequest,
} from './types'

const logger = createLogger('naver-commerce-api')

/** 네이버 커머스 API 클라이언트 */
export class NaverCommerceApiClient {
  private readonly client: AxiosInstance
  private accessToken: string | null = null
  private tokenExpiresAt: Date | null = null

  constructor(
    private readonly clientId: string = config.naver.clientId,
    private readonly clientSecret: string = config.naver.clientSecret,
    private readonly shopId: string = config.naver.shopId,
    private readonly baseUrl: string = config.naver.apiBaseUrl,
  ) {
    // Axios 인스턴스 초기화
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    })

    // 요청 인터셉터: 자동 인증 토큰 주입
    this.client.interceptors.request.use(async (reqConfig) => {
      const token = await this.getAccessToken()
      reqConfig.headers['Authorization'] = `Bearer ${token}`
      return reqConfig
    })

    // 응답 인터셉터: 오류 로깅
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        logger.error('네이버 API 오류', {
          status: error.response?.status,
          url: error.config?.url,
          data: error.response?.data,
        })
        return Promise.reject(error)
      }
    )
  }

  // =============================
  // 인증 (OAuth 2.0)
  // =============================

  /**
   * 액세스 토큰 발급 또는 캐시된 토큰 반환
   * 만료 5분 전에 자동 갱신
   */
  private async getAccessToken(): Promise<string> {
    const now = new Date()
    const bufferMs = 5 * 60 * 1000 // 5분 버퍼

    // 토큰이 유효하면 캐시 반환
    if (
      this.accessToken &&
      this.tokenExpiresAt &&
      this.tokenExpiresAt.getTime() - bufferMs > now.getTime()
    ) {
      return this.accessToken
    }

    // 새 토큰 발급
    logger.debug('네이버 액세스 토큰 갱신 중')
    const timestamp = Date.now()
    const signature = this.generateSignature(timestamp)

    const response = await axios.post<NaverTokenResponse>(
      `${this.baseUrl}/external/v1/oauth2/token`,
      null,
      {
        params: {
          grant_type: 'client_credentials',
          client_id: this.clientId,
          timestamp,
          client_secret_sign: signature,
          type: 'SELF',
        },
      }
    )

    this.accessToken = response.data.access_token
    this.tokenExpiresAt = new Date(now.getTime() + response.data.expires_in * 1000)

    logger.info('네이버 액세스 토큰 발급 완료', {
      expiresAt: this.tokenExpiresAt.toISOString(),
    })

    return this.accessToken
  }

  /**
   * bcrypt 기반 전자서명 생성
   * 네이버 커머스 API 공식 인증 방식:
   * 1. password = clientId + "_" + timestamp
   * 2. bcrypt.hashSync(password, clientSecret)
   * 3. Base64 인코딩
   */
  private generateSignature(timestamp: number): string {
    const password = `${this.clientId}_${timestamp}`
    const hashed = bcrypt.hashSync(password, this.clientSecret)
    return Buffer.from(hashed, 'utf-8').toString('base64')
  }

  // =============================
  // 상품 관련 API
  // =============================

  /**
   * 상품 등록 (v2 API — originProduct wrapper 필수)
   * Rate limit: 초당 1건 이하 (CLAUDE.md 필수 규칙)
   */
  async registerProduct(
    data: NaverProductRegisterRequest
  ): Promise<NaverProductRegisterResponse> {
    logger.info('상품 등록 요청', { name: data.name })

    // v2 API는 originProduct + smartstoreChannelProduct wrapper 필요
    const v2Body = {
      originProduct: {
        statusType: data.statusType,
        saleType: data.saleType,
        leafCategoryId: data.leafCategoryId,
        name: data.name,
        salePrice: data.salePrice,
        stockQuantity: data.stockQuantity,
        deliveryInfo: {
          ...data.deliveryInfo,
          deliveryCompany: data.deliveryInfo.deliveryCompany ?? 'CJGLS',
          deliveryFee: {
            ...data.deliveryInfo.deliveryFee,
            deliveryFeePayType: data.deliveryInfo.deliveryFee?.deliveryFeePayType ?? 'PREPAID',
          },
          claimDeliveryInfo: data.deliveryInfo.claimDeliveryInfo ?? {
            returnDeliveryFee: 2500,
            exchangeDeliveryFee: 5000,
          },
        },
        images: data.images,
        detailContent: data.detailContent,
        detailAttribute: {
          naverShoppingSearchInfo: { manufacturerName: '자체제작' },
          afterServiceInfo: {
            afterServiceTelephoneNumber: '010-0000-0000',
            afterServiceGuideContent: '구매 후 7일 이내 교환/반품 가능',
          },
          originAreaInfo: { originAreaCode: '00', content: '상세설명에 표시' },
          minorPurchasable: true,
          productInfoProvidedNotice: {
            productInfoProvidedNoticeType: 'ETC',
            etc: {
              returnCostReason: '구매 후 7일 이내 교환/반품 가능',
              noRefundReason: '상품 훼손 시 교환/반품 불가',
              qualityAssuranceStandard: '제품 이상 시 교환/환불',
              compensationProcedure: '전화 문의 후 처리',
              troubleShootingContents: '010-0000-0000',
              itemName: data.name.substring(0, 50),
              modelName: '상세설명 참조',
              manufacturer: '자체제작',
              customerServicePhoneNumber: '010-0000-0000',
            },
          },
          ...(data.optionInfo ? { optionInfo: data.optionInfo } : {}),
        },
      },
      smartstoreChannelProduct: {
        channelProductName: data.name,
        channelProductDisplayStatusType: 'ON',
        naverShoppingRegistration: true,
      },
    }

    const response = await this.client.post<NaverProductRegisterResponse>(
      `/external/v2/products`,
      v2Body
    )

    logger.info('상품 등록 완료', {
      productNo: response.data.originProductNo,
      name: data.name,
    })

    return response.data
  }

  /**
   * 상품 이미지 업로드 (네이버 이미지 서버)
   * 외부 URL은 직접 사용 불가, 반드시 업로드 후 반환된 URL 사용
   */
  async uploadProductImages(imagePaths: string[]): Promise<string[]> {
    const FormData = (await import('form-data')).default
    const fs = await import('fs')
    const pathMod = await import('path')

    const CONTENT_TYPES: Record<string, string> = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
    }

    const form = new FormData()
    for (const imgPath of imagePaths) {
      const ext = pathMod.extname(imgPath).toLowerCase()
      const contentType = CONTENT_TYPES[ext] ?? 'image/jpeg'
      form.append('imageFiles', fs.createReadStream(imgPath), {
        filename: pathMod.basename(imgPath),
        contentType,
      })
    }

    const response = await this.client.post<{ images: Array<{ url: string }> }>(
      `/external/v1/product-images/upload`,
      form,
      { headers: form.getHeaders() }
    )

    return response.data.images.map((img) => img.url)
  }

  /**
   * 상품 수정
   */
  async updateProduct(
    originProductNo: number,
    data: Partial<NaverProductRegisterRequest>
  ): Promise<void> {
    logger.info('상품 수정 요청', { originProductNo })

    await this.client.put(
      `/external/v2/products/${originProductNo}`,
      { ...data, originProductNo }
    )

    logger.info('상품 수정 완료', { originProductNo })
  }

  /**
   * 판매가 변경
   */
  async updatePrice(data: NaverPriceUpdateRequest): Promise<void> {
    logger.info('가격 변경 요청', data)

    await this.client.patch(
      `/external/v2/products/${data.originProductNo}/price`,
      { salePrice: data.salePrice }
    )

    logger.info('가격 변경 완료', data)
  }

  /**
   * 상품 일시 정지
   */
  async suspendProduct(originProductNo: number): Promise<void> {
    await this.client.put(
      `/external/v2/products/${originProductNo}/status/SUSPENSION`
    )
    logger.info('상품 일시 정지', { originProductNo })
  }

  // =============================
  // 주문 관련 API
  // =============================

  /**
   * 주문 목록 조회 (last-changed-statuses 엔드포인트)
   * 네이버 커머스 API는 POST body로 검색 조건을 전달
   */
  async getOrders(params: NaverOrderListRequest = {}): Promise<NaverOrderListResponse> {
    const now = new Date()
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    const requestBody = {
      lastChangedFrom: params.placedFrom ?? oneDayAgo.toISOString(),
      lastChangedStatuses: params.productOrderStatuses ?? ['PAY_DONE', 'DELIVERING', 'DELIVERED'],
    }

    logger.debug('주문 목록 조회', requestBody)

    const response = await this.client.post<{ data: { lastChangeStatuses: Array<{ productOrderId: string; lastChangedDate: string; lastChangedType: string; orderId: string }> } }>(
      `/external/v1/pay-order/seller/product-orders/last-changed-statuses`,
      requestBody
    )

    const statusItems = response.data?.data?.lastChangeStatuses ?? []

    // 상품주문 ID로 상세 조회
    if (statusItems.length === 0) {
      return { data: [], total: 0, page: 1, size: 0 }
    }

    const productOrderIds = statusItems.map((item) => item.productOrderId)
    const details = await this.getProductOrderDetails(productOrderIds)

    return {
      data: details,
      total: details.length,
      page: 1,
      size: details.length,
    }
  }

  /**
   * 상품 주문 상세 조회 (복수)
   */
  private async getProductOrderDetails(productOrderIds: string[]): Promise<NaverOrderItem[]> {
    if (productOrderIds.length === 0) return []

    const response = await this.client.post<{ data: Array<{ productOrder: Record<string, unknown>; order: Record<string, unknown> }> }>(
      `/external/v1/pay-order/seller/product-orders/query`,
      { productOrderIds }
    )

    const items = response.data?.data ?? []

    return items.map((item) => {
      const po = item.productOrder as Record<string, unknown>
      const order = item.order as Record<string, unknown>
      const shippingAddr = po['shippingAddress'] as Record<string, string> | undefined

      return {
        productOrderId: String(po['productOrderId'] ?? ''),
        orderId: String(order['orderId'] ?? po['orderId'] ?? ''),
        productId: String(po['productId'] ?? ''),
        productName: String(po['productName'] ?? ''),
        quantity: Number(po['quantity'] ?? 1),
        salePrice: Number(po['unitPrice'] ?? po['totalPaymentAmount'] ?? 0),
        productOrderStatus: String(po['productOrderStatus'] ?? ''),
        deliveryStatus: String(po['deliveryStatus'] ?? ''),
        shippingAddress: shippingAddr ? {
          name: shippingAddr['name'] ?? '',
          tel: shippingAddr['tel1'] ?? '',
          zipCode: shippingAddr['zipCode'] ?? '',
          baseAddress: shippingAddr['baseAddress'] ?? '',
          detailAddress: shippingAddr['detailAddress'] ?? '',
        } : undefined,
        trackingNumber: po['trackingNumber'] as string | undefined,
        logisticsCompanyCode: po['deliveryCompany'] as string | undefined,
        orderDate: String(po['orderDate'] ?? order['orderDate'] ?? ''),
        paymentDate: po['paymentDate'] as string | undefined,
        shippingDate: po['shippingDate'] as string | undefined,
      }
    })
  }

  /**
   * 새 주문 조회 (결제 완료 상태만)
   */
  async getNewOrders(): Promise<NaverOrderListResponse> {
    return this.getOrders({
      productOrderStatuses: ['PAY_DONE'],
    })
  }

  /**
   * 발송 처리 (운송장 등록)
   */
  async confirmShipping(data: NaverShippingRequest): Promise<void> {
    logger.info('발송 처리 요청', {
      count: data.dispatchProductOrders.length,
    })

    await this.client.post(
      `/external/v1/pay-order/seller/product-orders/dispatch`,
      data
    )

    logger.info('발송 처리 완료')
  }

  // =============================
  // 취소/반품 관련 API (Phase 4)
  // =============================

  /**
   * 취소 승인
   */
  async approveCancel(data: NaverCancelApproveRequest): Promise<void> {
    logger.info('취소 승인 요청', { productOrderId: data.productOrderId })

    await this.client.post(
      `/external/v1/pay-order/seller/product-orders/${data.productOrderId}/claim/cancel/approve`,
      { cancelReason: data.cancelReason }
    )

    logger.info('취소 승인 완료', { productOrderId: data.productOrderId })
  }

  /**
   * 취소 거절
   */
  async rejectCancel(data: NaverCancelRejectRequest): Promise<void> {
    logger.info('취소 거절 요청', { productOrderId: data.productOrderId })

    await this.client.post(
      `/external/v1/pay-order/seller/product-orders/${data.productOrderId}/claim/cancel/reject`,
      { rejectReason: data.rejectReason }
    )

    logger.info('취소 거절 완료', { productOrderId: data.productOrderId })
  }

  /**
   * 반품 승인
   */
  async approveReturn(data: NaverReturnApproveRequest): Promise<void> {
    logger.info('반품 승인 요청', { productOrderId: data.productOrderId })

    await this.client.post(
      `/external/v1/pay-order/seller/product-orders/${data.productOrderId}/claim/return/approve`,
      { returnReason: data.returnReason }
    )

    logger.info('반품 승인 완료', { productOrderId: data.productOrderId })
  }

  /**
   * 반품 거절
   */
  async rejectReturn(data: NaverReturnRejectRequest): Promise<void> {
    logger.info('반품 거절 요청', { productOrderId: data.productOrderId })

    await this.client.post(
      `/external/v1/pay-order/seller/product-orders/${data.productOrderId}/claim/return/reject`,
      { rejectReason: data.rejectReason }
    )

    logger.info('반품 거절 완료', { productOrderId: data.productOrderId })
  }

  // =============================
  // 유틸리티
  // =============================

  /**
   * API 연결 테스트
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.getAccessToken()
      logger.info('네이버 커머스 API 연결 정상')
      return true
    } catch (error) {
      logger.error('네이버 커머스 API 연결 실패', error)
      return false
    }
  }
}

// 싱글톤 인스턴스
export const naverCommerceApi = new NaverCommerceApiClient()
