// =============================================
// admin-proxy Route 단위 테스트
//
// 테스트 전략:
//   - next/server 를 Web API Response 호환 구조로 모킹
//   - fetch 글로벌 모킹으로 업스트림 API 호출 격리
//   - x-admin-token 헤더 검증 시나리오 집중
// =============================================

// ① next/server 모킹 — jest.mock은 import보다 먼저 실행됨(자동 호이스팅)
jest.mock('next/server', () => ({
  // NextRequest는 표준 Request를 상속하는 래퍼 — 테스트에서는 기본 구현 사용
  NextRequest: class extends Request {
    constructor(url: string | URL, init?: RequestInit) {
      super(url, init)
    }
  },
  // NextResponse.json()을 표준 Response로 구현 → res.status / await res.json() 사용 가능
  NextResponse: {
    json(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      return new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      })
    },
  },
}))

// ② fetch 글로벌 모킹 (업스트림 Admin API 호출 격리)
const mockFetch = jest.fn()
global.fetch = mockFetch

// ③ route 핸들러 import (모킹 이후)
import { POST } from './route'

// =============================================
// 테스트용 요청 생성 헬퍼
// =============================================

const VALID_TOKEN = 'test-proxy-token-abc123!'

/**
 * 테스트용 NextRequest-호환 요청 생성
 * (mocked NextRequest = Request 이므로 타입 캐스팅)
 */
function makeRequest(opts: {
  token?: string
  body?: unknown
}): Parameters<typeof POST>[0] {
  return new Request('http://localhost/api/admin-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // token이 undefined이면 헤더 자체를 포함하지 않음
      ...(opts.token !== undefined ? { 'x-admin-token': opts.token } : {}),
    },
    body: JSON.stringify(
      opts.body ?? { path: '/admin/system', method: 'GET' }
    ),
  }) as Parameters<typeof POST>[0]
}

// =============================================
// 테스트 스위트
// =============================================

describe('POST /api/admin-proxy — x-admin-token 검증', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // 테스트 환경변수 설정
    process.env['ADMIN_PASS'] = 'strong-test-pass!'
    process.env['ADMIN_USER'] = 'admin'
    process.env['ADMIN_PROXY_TOKEN'] = VALID_TOKEN
    process.env['INTERNAL_API_BASE'] = 'http://localhost:3000'
  })

  afterEach(() => {
    // 환경변수 정리 (다른 테스트에 영향 방지)
    delete process.env['ADMIN_PROXY_TOKEN']
  })

  // ---- 인증 실패 케이스 ----

  it('x-admin-token 헤더 없으면 → 401 Unauthorized', async () => {
    const req = makeRequest({ token: undefined })
    const res = await POST(req)

    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Unauthorized')
    // 업스트림 호출 없어야 함
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('잘못된 x-admin-token → 401 Unauthorized', async () => {
    const req = makeRequest({ token: 'wrong-token-xyz' })
    const res = await POST(req)

    expect(res.status).toBe(401)
    // 업스트림 호출 없어야 함
    expect(mockFetch).not.toHaveBeenCalled()
  })

  // ---- 인증 성공 케이스 ----

  it('올바른 x-admin-token → 401이 아님 + 업스트림 호출', async () => {
    // 업스트림 Admin API 응답 목
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ workerAlive: true, dbConnected: true }),
      status: 200,
    })

    const req = makeRequest({
      token: VALID_TOKEN,
      body: { path: '/admin/system', method: 'GET' },
    })
    const res = await POST(req)

    // 토큰 검증 통과 → 401이 아님
    expect(res.status).not.toBe(401)
    // 업스트림 Admin API가 실제로 호출됨
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/admin/system',
      expect.objectContaining({ method: 'GET' })
    )
  })
})
