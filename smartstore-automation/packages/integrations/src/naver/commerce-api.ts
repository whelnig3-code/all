// =============================================
// 네이버 커머스 API 클라이언트
// - OAuth 2.0 인증 (자동 토큰 갱신)
// - Rate limit 준수: 초당 1건 이하
// =============================================

import axios, { AxiosInstance, AxiosError } from 'axios'
import * as crypto from 'crypto'
import { config, createLogger } from '@smartstore/shared'
import type {
  NaverTokenResponse,
  NaverProductRegisterRequest,
  NaverProductRegisterResponse,
  NaverOrderListRequest,
  NaverOrderListResponse,
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
   * HMAC-SHA256 서명 생성
   * 네이버 커머스 API 인증 방식
   */
  private generateSignature(timestamp: number): string {
    const message = `${this.clientId}_${timestamp}`
    return crypto
      .createHmac('sha256', this.clientSecret)
      .update(message)
      .digest('base64')
  }

  // =============================
  // 상품 관련 API
  // =============================

  /**
   * 상품 등록
   * Rate limit: 초당 1건 이하 (CLAUDE.md 필수 규칙)
   */
  async registerProduct(
    data: NaverProductRegisterRequest
  ): Promise<NaverProductRegisterResponse> {
    logger.info('상품 등록 요청', { name: data.name })

    const response = await this.client.post<NaverProductRegisterResponse>(
      `/external/v2/products`,
      data
    )

    logger.info('상품 등록 완료', {
      productNo: response.data.originProductNo,
      name: data.name,
    })

    return response.data
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
   * 주문 목록 조회
   * 기본값: 최근 결제 완료 주문
   */
  async getOrders(params: NaverOrderListRequest = {}): Promise<NaverOrderListResponse> {
    const defaultParams: NaverOrderListRequest = {
      page: 1,
      size: 100,
      productOrderStatuses: ['PAY_DONE', 'DELIVERING', 'DELIVERED'],
      ...params,
    }

    logger.debug('주문 목록 조회', defaultParams)

    const response = await this.client.get<NaverOrderListResponse>(
      `/external/v1/pay-order/seller/product-orders/query`,
      { params: defaultParams }
    )

    return response.data
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
