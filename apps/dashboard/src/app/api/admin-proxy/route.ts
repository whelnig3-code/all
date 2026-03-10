// =============================================
// Admin API 프록시 Route (Next.js App Router)
//
// 역할:
//   - 브라우저(클라이언트)가 Admin API를 직접 호출하지 않도록 프록시
//   - ADMIN_USER / ADMIN_PASS 는 서버 측에서만 처리 (브라우저에 미노출)
//   - NEXT_PUBLIC_ADMIN_PASS 절대 사용 금지
//
// 요청 형식 (POST /api/admin-proxy):
//   { path: string, method: string, body?: unknown }
//   헤더: x-admin-token: <NEXT_PUBLIC_ADMIN_PROXY_TOKEN>
//
// 환경변수 (apps/dashboard/.env.local):
//   ADMIN_USER              관리자 계정명 (서버 전용)
//   ADMIN_PASS              관리자 비밀번호 (서버 전용, changeme 금지)
//   INTERNAL_API_BASE       API 서버 내부 URL (서버 전용)
//   ADMIN_PROXY_TOKEN       프록시 접근 토큰 (서버 전용, 검증용)
//   NEXT_PUBLIC_ADMIN_PROXY_TOKEN  동일 토큰 (브라우저 노출 OK — 접근 제한 용도)
// =============================================

import { type NextRequest, NextResponse } from 'next/server'

// =============================================
// 요청 바디 타입
// =============================================

interface ProxyRequestBody {
  path: string
  method: string
  body?: unknown
}

// =============================================
// ADMIN_PASS 보안 검증 (대시보드 서버 측)
// =============================================

function checkAdminPassConfigured(): void {
  const pass = process.env['ADMIN_PASS']
  if (!pass || pass === 'changeme') {
    throw new Error(
      '[SECURITY] ADMIN_PASS must be set to a strong value. Default "changeme" is not allowed.'
    )
  }
}

// =============================================
// POST /api/admin-proxy
// =============================================

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ① x-admin-token 검증 — 브라우저 직접 접근 방지 (가장 먼저 실행)
  const token = req.headers.get('x-admin-token')
  if (!token || token !== process.env['ADMIN_PROXY_TOKEN']) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ② ADMIN_PASS 기본값 차단
  try {
    checkAdminPassConfigured()
  } catch {
    return NextResponse.json(
      { error: 'Server misconfiguration: ADMIN_PASS not properly configured' },
      { status: 500 }
    )
  }

  // 요청 파싱
  let proxyBody: ProxyRequestBody
  try {
    proxyBody = (await req.json()) as ProxyRequestBody
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { path, method, body } = proxyBody

  // path / method 기본 유효성 검사
  if (!path || !method) {
    return NextResponse.json({ error: 'path and method are required' }, { status: 400 })
  }

  // 허용된 경로만 프록시 (화이트리스트)
  const ALLOWED_PREFIXES = [
    '/admin/',
    '/products',
    '/orders',
    '/inventory',
    '/report',
    '/analytics',
    '/monitoring',
  ]
  if (!ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return NextResponse.json({ error: 'forbidden path' }, { status: 403 })
  }

  // Basic Auth 헤더 생성 (서버 측 Buffer.from — btoa 사용 안 함)
  const adminUser = process.env['ADMIN_USER'] ?? 'admin'
  const adminPass = process.env['ADMIN_PASS']!
  const authHeader = 'Basic ' + Buffer.from(`${adminUser}:${adminPass}`).toString('base64')

  const internalBase = process.env['INTERNAL_API_BASE'] ?? 'http://localhost:3000'

  // 실제 Admin API 호출
  try {
    const upstream = await fetch(`${internalBase}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    const data: unknown = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch (err) {
    return NextResponse.json(
      { error: 'Upstream request failed', detail: String(err) },
      { status: 502 }
    )
  }
}
