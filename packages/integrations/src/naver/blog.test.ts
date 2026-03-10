// =============================================
// 네이버 블로그 포스트 게시 단위 테스트
// - dry-run 모드
// - 인증 토큰 검증
// - API 호출 성공/실패
// =============================================

// @smartstore/shared mock
jest.mock('@smartstore/shared', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}))

import { postToNaverBlog } from './blog'
import type { NaverBlogPostRequest } from './blog'

// =============================================
// 헬퍼
// =============================================

function createPost(overrides: Partial<NaverBlogPostRequest> = {}): NaverBlogPostRequest {
  return {
    title: '테스트 포스트',
    contents: '<p>테스트 본문</p>',
    ...overrides,
  }
}

function mockFetchSuccess(postUrl = 'https://blog.naver.com/test/123') {
  ;(global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ postUrl }),
  })
}

function mockFetchError(status = 500, text = 'Internal Server Error') {
  ;(global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: false,
    status,
    text: async () => text,
  })
}

function mockFetchNetworkError(message = 'Network error') {
  ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error(message))
}

// =============================================
// 테스트
// =============================================

describe('postToNaverBlog', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    jest.restoreAllMocks()
    global.fetch = jest.fn()
    delete process.env['BLOG_POSTING_ENABLED']
    delete process.env['NAVER_BLOG_ACCESS_TOKEN']
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  // ----- dry-run 모드 -----

  it('BLOG_POSTING_ENABLED !== "true" → dry-run 모드, fetch 미호출', async () => {
    process.env['BLOG_POSTING_ENABLED'] = 'false'
    const result = await postToNaverBlog(createPost())

    expect(result).toEqual({ success: true, postUrl: undefined })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('BLOG_POSTING_ENABLED 미설정 → dry-run 모드', async () => {
    const result = await postToNaverBlog(createPost())

    expect(result).toEqual({ success: true, postUrl: undefined })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  // ----- 토큰 누락 -----

  it('BLOG_POSTING_ENABLED=true + 토큰 미설정 → 실패 반환', async () => {
    process.env['BLOG_POSTING_ENABLED'] = 'true'

    const result = await postToNaverBlog(createPost())

    expect(result.success).toBe(false)
    expect(result.error).toContain('NAVER_BLOG_ACCESS_TOKEN')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  // ----- 성공 케이스 -----

  it('활성화 + 토큰 설정 → fetch 호출 후 postUrl 반환', async () => {
    process.env['BLOG_POSTING_ENABLED'] = 'true'
    process.env['NAVER_BLOG_ACCESS_TOKEN'] = 'test-token'
    const expectedUrl = 'https://blog.naver.com/test/456'
    mockFetchSuccess(expectedUrl)

    const result = await postToNaverBlog(createPost())

    expect(result).toEqual({ success: true, postUrl: expectedUrl })
    expect(global.fetch).toHaveBeenCalledWith(
      'https://openapi.naver.com/v1/blog/writePost.json',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    )
  })

  // ----- 태그 포함 -----

  it('tags 설정 시 요청 body에 태그 포함', async () => {
    process.env['BLOG_POSTING_ENABLED'] = 'true'
    process.env['NAVER_BLOG_ACCESS_TOKEN'] = 'test-token'
    mockFetchSuccess()

    await postToNaverBlog(createPost({ tags: '태그1,태그2' }))

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0]
    const body = fetchCall[1].body as string
    expect(body).toContain('tags=')
    expect(body).toContain(encodeURIComponent('태그1,태그2'))
  })

  // ----- API 오류 (non-ok response) -----

  it('API 오류 응답 (non-ok) → 실패 반환', async () => {
    process.env['BLOG_POSTING_ENABLED'] = 'true'
    process.env['NAVER_BLOG_ACCESS_TOKEN'] = 'test-token'
    mockFetchError(403, 'Forbidden')

    const result = await postToNaverBlog(createPost())

    expect(result.success).toBe(false)
    expect(result.error).toContain('403')
    expect(result.error).toContain('Forbidden')
  })

  // ----- 네트워크 오류 -----

  it('네트워크 오류 → 실패 반환 (에러 메시지 포함)', async () => {
    process.env['BLOG_POSTING_ENABLED'] = 'true'
    process.env['NAVER_BLOG_ACCESS_TOKEN'] = 'test-token'
    mockFetchNetworkError('fetch failed')

    const result = await postToNaverBlog(createPost())

    expect(result.success).toBe(false)
    expect(result.error).toBe('fetch failed')
  })

  // ----- isOpenPost 기본값 -----

  it('isOpenPost 미지정 → body에 "true" 포함 (기본값)', async () => {
    process.env['BLOG_POSTING_ENABLED'] = 'true'
    process.env['NAVER_BLOG_ACCESS_TOKEN'] = 'test-token'
    mockFetchSuccess()

    await postToNaverBlog(createPost())

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0]
    const body = fetchCall[1].body as string
    expect(body).toContain('isOpenPost=true')
  })
})
