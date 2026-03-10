// =============================================
// Admin Proxy Route 단위 테스트
// =============================================

import { NextRequest } from 'next/server'

// 환경변수 설정
beforeAll(() => {
  process.env['ADMIN_PROXY_TOKEN'] = 'test-proxy-token'
  process.env['ADMIN_USER'] = 'admin'
  process.env['ADMIN_PASS'] = 'strong-password-123!'
  process.env['INTERNAL_API_BASE'] = 'http://localhost:3000'
})

// fetch 모킹
const mockFetch = jest.fn()
global.fetch = mockFetch

import { POST } from '../app/api/admin-proxy/route'

function makeRequest(body: Record<string, unknown>, token: string = 'test-proxy-token') {
  return new NextRequest('http://localhost:4000/api/admin-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': token,
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/admin-proxy', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('유효한 요청 → 200 + upstream 응답', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      json: async () => ({ data: 'test' }),
    })

    const res = await POST(makeRequest({ path: '/products', method: 'GET' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toBe('test')
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/products',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Basic'),
        }),
      }),
    )
  })

  it('잘못된 토큰 → 401', async () => {
    const res = await POST(makeRequest({ path: '/products', method: 'GET' }, 'wrong-token'))
    expect(res.status).toBe(401)
  })

  it('토큰 없음 → 401', async () => {
    const req = new NextRequest('http://localhost:4000/api/admin-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/products', method: 'GET' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('허용되지 않은 경로 → 403', async () => {
    const res = await POST(makeRequest({ path: '/secret/data', method: 'GET' }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('forbidden path')
  })

  it('path 없음 → 400', async () => {
    const res = await POST(makeRequest({ method: 'GET' }))
    expect(res.status).toBe(400)
  })

  it('허용된 경로 프리픽스 통과', async () => {
    mockFetch.mockResolvedValue({ status: 200, json: async () => ({}) })

    const prefixes = ['/admin/', '/products', '/orders', '/inventory', '/report', '/analytics', '/monitoring']
    for (const prefix of prefixes) {
      const res = await POST(makeRequest({ path: `${prefix}/test`, method: 'GET' }))
      expect(res.status).toBe(200)
    }
  })

  it('upstream 실패 → 502', async () => {
    mockFetch.mockRejectedValue(new Error('Connection refused'))

    const res = await POST(makeRequest({ path: '/products', method: 'GET' }))
    expect(res.status).toBe(502)
  })

  it('POST body를 upstream에 전달', async () => {
    mockFetch.mockResolvedValue({ status: 201, json: async () => ({ id: '1' }) })

    await POST(makeRequest({ path: '/products', method: 'POST', body: { name: '테스트' } }))

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/products',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: '테스트' }),
      }),
    )
  })
})
