// =============================================
// 네이버 블로그 Open API 클라이언트 (P3)
//
// API: POST https://openapi.naver.com/v1/blog/writePost.json
// 인증: Bearer {NAVER_BLOG_ACCESS_TOKEN}
//
// ⚠️ 사전 준비:
//   1. 네이버 개발자 센터에서 OAuth 2.0 사용자 인증 1회 진행
//   2. 발급받은 access_token을 NAVER_BLOG_ACCESS_TOKEN 환경변수에 설정
//   3. BLOG_POSTING_ENABLED=true 설정 시 활성화
// =============================================

import { createLogger } from '@smartstore/shared'

const logger = createLogger('naver-blog')

/** 블로그 포스트 게시 요청 */
export interface NaverBlogPostRequest {
  /** 포스트 제목 */
  title: string
  /** 포스트 본문 (HTML) */
  contents: string
  /** 태그 (쉼표 구분) */
  tags?: string
  /** 공개 여부 (기본 true) */
  isOpenPost?: boolean
}

/** 블로그 포스트 게시 결과 */
export interface NaverBlogPostResult {
  /** 게시 성공 여부 */
  success: boolean
  /** 게시된 포스트 URL (성공 시) */
  postUrl?: string
  /** 오류 메시지 (실패 시) */
  error?: string
}

const NAVER_BLOG_API_URL = 'https://openapi.naver.com/v1/blog/writePost.json'

/**
 * 네이버 블로그에 포스트 게시
 *
 * - NAVER_BLOG_ACCESS_TOKEN 환경변수 필요 (OAuth 2.0 사용자 토큰)
 * - BLOG_POSTING_ENABLED=false 이면 dry-run 로그만 출력
 */
export async function postToNaverBlog(
  post: NaverBlogPostRequest
): Promise<NaverBlogPostResult> {
  const accessToken = process.env['NAVER_BLOG_ACCESS_TOKEN']
  const enabled = process.env['BLOG_POSTING_ENABLED'] === 'true'

  // Kill Switch
  if (!enabled) {
    logger.info('BLOG_POSTING_ENABLED=false — dry-run 모드 (실제 게시 안 함)', {
      title: post.title,
    })
    return { success: true, postUrl: undefined }
  }

  if (!accessToken) {
    const error = 'NAVER_BLOG_ACCESS_TOKEN 환경변수가 설정되지 않았습니다'
    logger.error(error)
    return { success: false, error }
  }

  try {
    // URLSearchParams로 form-data 형식 전송
    const body = new URLSearchParams()
    body.append('title', post.title)
    body.append('contents', post.contents)
    if (post.tags) body.append('tags', post.tags)
    body.append('isOpenPost', String(post.isOpenPost ?? true))

    const response = await fetch(NAVER_BLOG_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })

    if (!response.ok) {
      const text = await response.text()
      const error = `네이버 블로그 API 오류 ${response.status}: ${text}`
      logger.error(error, { title: post.title })
      return { success: false, error }
    }

    const data = (await response.json()) as { postUrl?: string }
    const postUrl = data.postUrl

    logger.info('블로그 포스트 게시 완료', { title: post.title, postUrl })
    return { success: true, postUrl }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('블로그 게시 실패', { title: post.title, error: message })
    return { success: false, error: message }
  }
}
