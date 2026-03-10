// =============================================
// Admin API 클라이언트 (대시보드 전용)
//
// 보안 구조:
//   - 브라우저 → POST /api/admin-proxy (x-admin-token 헤더 포함)
//   - Next.js Server → Admin API (Basic Auth는 서버 측에서만 처리)
//   - ADMIN_PASS는 절대 브라우저 번들에 포함되지 않음
//   - NEXT_PUBLIC_ADMIN_PASS 사용 없음
//
// 환경변수:
//   서버 측 (apps/dashboard/.env.local, NEXT_PUBLIC_ 없음):
//     ADMIN_USER, ADMIN_PASS, INTERNAL_API_BASE, ADMIN_PROXY_TOKEN
//   클라이언트 측 (브라우저 노출 OK — 접근 제한 용도):
//     NEXT_PUBLIC_ADMIN_PROXY_TOKEN  ← x-admin-token 헤더 값
// =============================================

// =============================================
// 응답 타입 정의
// =============================================

/** GET /admin/system 응답 */
export interface SystemStatus {
  workerAlive: boolean
  dbConnected: boolean
  redisConnected: boolean
  memory: {
    heapUsedMB: number
    rssMB: number
    heapTotalMB: number
  }
  competitorQueueDepth: number
  timestamp: string
  /** 설정값 (Kill Switch + 셀러 유형) */
  settings: {
    AUTO_PRICE_ENABLED: string
    AUTO_ORDER_ENABLED: string
    AUTO_SHIPPING_ENABLED: string
    SELLER_TYPE: string
  }
}

/** GET /admin/metrics 응답 */
export interface DailyMetrics {
  totalRevenue: number
  totalMargin: number
  orderCount: number
  fallbackCount: number
  failedJobCount: number
  date: string
}

/** 제어 키 타입 (Kill Switch + 셀러 유형) */
export type ControlKey =
  | 'AUTO_PRICE_ENABLED'
  | 'AUTO_ORDER_ENABLED'
  | 'AUTO_SHIPPING_ENABLED'
  | 'SELLER_TYPE'

/** POST /admin/control 응답 */
export interface ControlResult {
  success: boolean
  key: string
  value: string
  updatedAt: string
}

// =============================================
// 프록시 호출 헬퍼 (인증은 서버 측에서 처리)
// =============================================

/**
 * /api/admin-proxy를 통해 Admin API 호출
 * - 브라우저에서 직접 Admin API에 접근하지 않음
 * - ADMIN_PASS는 서버 측에서만 사용됨
 * - x-admin-token: 프록시 Route 접근 제한 토큰 (브라우저 노출 OK)
 */
async function adminProxy<T>(
  path: string,
  method: string = 'GET',
  body?: unknown
): Promise<T> {
  const res = await fetch('/api/admin-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // NEXT_PUBLIC_ 이므로 빌드 타임에 인라인됨 — ADMIN_PASS와 다른 값
      'x-admin-token': process.env['NEXT_PUBLIC_ADMIN_PROXY_TOKEN'] ?? '',
    },
    body: JSON.stringify({ path, method, body }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`[${res.status}] ${path} — ${text}`)
  }

  return res.json() as Promise<T>
}

// =============================================
// API 함수
// =============================================

/**
 * 시스템 상태 조회 (GET /admin/system)
 * - settings 필드에 Kill Switch 현재값 포함
 */
export async function fetchSystemStatus(): Promise<SystemStatus> {
  return adminProxy<SystemStatus>('/admin/system', 'GET')
}

/**
 * 오늘 실적 조회 (GET /admin/metrics)
 */
export async function fetchMetrics(): Promise<DailyMetrics> {
  return adminProxy<DailyMetrics>('/admin/metrics', 'GET')
}

/**
 * 설정 제어 (POST /admin/control)
 * @param key   제어 대상 키
 * @param value Kill Switch: 'true'/'false', SELLER_TYPE: 'individual'/'business'
 */
export async function updateControl(
  key: ControlKey,
  value: string
): Promise<ControlResult> {
  return adminProxy<ControlResult>('/admin/control', 'POST', { key, value })
}

// =============================================
// 알림 API
// =============================================

/** GET /admin/alerts 알림 항목 */
export interface AlertItem {
  id: string
  jobType: string
  status: string
  message: string
  createdAt: string
}

/**
 * 최근 알림 조회 (GET /admin/alerts)
 * - JobLog 기반 실패/이벤트 알림
 */
export async function fetchAlerts(): Promise<{ alerts: AlertItem[] }> {
  return adminProxy<{ alerts: AlertItem[] }>('/admin/alerts', 'GET')
}

// =============================================
// 자격증명 관리 API
// =============================================

export type ServiceType =
  | 'naver_commerce'
  | 'naver_blog'
  | 'domaegguk'
  | 'ownerclan'
  | 'telegram'

export type CredentialStatus = 'configured' | 'not_configured' | 'test_failed'

export interface ServiceStatusInfo {
  service: ServiceType
  status: CredentialStatus
  lastTestedAt: string | null
  testError: string | null
  fields: Record<string, string>
}

export interface CredentialTestResult {
  service: string
  success: boolean
  message: string
  error: string | null
}

/** 전체 서비스 자격증명 상태 조회 */
export async function fetchCredentialStatuses(): Promise<{ services: ServiceStatusInfo[] }> {
  return adminProxy<{ services: ServiceStatusInfo[] }>('/admin/credentials', 'GET')
}

/** 자격증명 저장 */
export async function saveServiceCredentials(
  service: ServiceType,
  credentials: Record<string, string>,
): Promise<{ success: boolean }> {
  return adminProxy<{ success: boolean }>(
    `/admin/credentials/${service}`,
    'PUT',
    { credentials },
  )
}

/** 자격증명 삭제 */
export async function deleteServiceCredentials(
  service: ServiceType,
): Promise<{ success: boolean }> {
  return adminProxy<{ success: boolean }>(
    `/admin/credentials/${service}`,
    'DELETE',
  )
}

/** 연결 테스트 */
export async function testServiceConnection(
  service: ServiceType,
): Promise<CredentialTestResult> {
  return adminProxy<CredentialTestResult>(
    `/admin/credentials/${service}/test`,
    'POST',
  )
}
