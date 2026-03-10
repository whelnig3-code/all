// =============================================
// Base API Client
//
// TalkTalkClient 등 외부 API 클라이언트의 공통 기반.
// 비유: 모든 외교관이 공유하는 기본 프로토콜 — 인사, 통역, 오류 처리.
// =============================================

import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios'

/** 범용 API 응답 래퍼 */
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

/**
 * HTTP 기반 API 클라이언트 추상 기반 클래스
 *
 * 제공 기능:
 * - 공통 헤더 관리 (setHeader)
 * - 요청/응답 에러 핸들링 (request)
 * - 타임아웃 설정 (30초)
 */
export abstract class BaseApiClient {
  protected readonly httpClient: AxiosInstance

  constructor() {
    this.httpClient = axios.create({
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  /** HTTP 헤더 설정 */
  protected setHeader(key: string, value: string): void {
    this.httpClient.defaults.headers.common[key] = value
  }

  /** HTTP 요청 실행 + ApiResponse 래핑 */
  protected async request<T>(config: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await this.httpClient.request<T>(config)
      return { success: true, data: response.data }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  }
}
