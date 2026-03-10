// =============================================
// 서비스별 연결 테스트 함수
// - 각 서비스에 맞는 최소 API 호출로 인증 확인
// =============================================

import axios from 'axios'
import bcrypt from 'bcrypt'
import { createLogger } from '@smartstore/shared'
import type { ServiceType } from '@smartstore/core'

const logger = createLogger('credential-tester')

export interface TestResult {
  success: boolean
  message: string
  error?: string
}

/**
 * 서비스별 연결 테스트 디스패처
 */
export async function testServiceConnection(
  service: ServiceType,
  creds: Record<string, string>,
): Promise<TestResult> {
  const testers: Record<ServiceType, (c: Record<string, string>) => Promise<TestResult>> = {
    naver_commerce: testNaverCommerce,
    naver_blog: testNaverBlog,
    naver_talktalk: testNaverTalkTalk,
    telegram: testTelegram,
    domaegguk: testDomaegguk,
    ownerclan: testOwnerclan,
    onchannel: testOnchannel,
  }

  const tester = testers[service]
  try {
    return await tester(creds)
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    logger.error('연결 테스트 예외', { service, error: errMsg })
    return { success: false, message: '연결 테스트 실패', error: errMsg }
  }
}

/**
 * 네이버 커머스 — OAuth 토큰 발급 시도
 */
async function testNaverCommerce(creds: Record<string, string>): Promise<TestResult> {
  const { clientId, clientSecret } = creds
  if (!clientId || !clientSecret) {
    return { success: false, message: 'clientId, clientSecret 필요', error: 'missing_fields' }
  }

  try {
    const timestamp = Date.now()
    // bcrypt 기반 전자서명 (네이버 커머스 API 공식 방식)
    const password = `${clientId}_${timestamp}`
    const hashed = bcrypt.hashSync(password, clientSecret)
    const signature = Buffer.from(hashed, 'utf-8').toString('base64')

    const response = await axios.post(
      'https://api.commerce.naver.com/external/v1/oauth2/token',
      null,
      {
        params: {
          grant_type: 'client_credentials',
          client_id: clientId,
          timestamp,
          client_secret_sign: signature,
          type: 'SELF',
        },
        timeout: 10000,
      },
    )

    if (response.data?.access_token) {
      return { success: true, message: 'OAuth 토큰 발급 성공' }
    }
    return { success: false, message: '토큰 응답 이상', error: JSON.stringify(response.data) }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    return { success: false, message: 'OAuth 토큰 발급 실패', error: errMsg }
  }
}

/**
 * 네이버 톡톡 — Talk API 헬스체크
 */
async function testNaverTalkTalk(creds: Record<string, string>): Promise<TestResult> {
  const { clientId, clientSecret } = creds
  if (!clientId || !clientSecret) {
    return { success: false, message: 'clientId, clientSecret 필요', error: 'missing_fields' }
  }

  try {
    const response = await axios.get('https://talk-api.naver.com/v1/templates/auto-reply', {
      headers: {
        'X-Client-Id': clientId,
        'X-Client-Secret': clientSecret,
      },
      timeout: 10000,
    })

    if (response.status === 200) {
      return { success: true, message: '톡톡 API 연결 성공' }
    }
    return { success: false, message: '톡톡 API 응답 이상', error: `status: ${response.status}` }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    return { success: false, message: '톡톡 API 연결 실패', error: errMsg }
  }
}

/**
 * 네이버 블로그 — 블로그 정보 조회 API
 */
async function testNaverBlog(creds: Record<string, string>): Promise<TestResult> {
  const { accessToken } = creds
  if (!accessToken) {
    return { success: false, message: 'accessToken 필요', error: 'missing_fields' }
  }

  try {
    const response = await axios.get('https://openapi.naver.com/blog/listCategory.json', {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 10000,
    })

    if (response.status === 200) {
      return { success: true, message: '블로그 API 인증 성공' }
    }
    return { success: false, message: '블로그 API 응답 이상', error: `status: ${response.status}` }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    return { success: false, message: '블로그 API 인증 실패', error: errMsg }
  }
}

/**
 * 텔레그램 — getMe API
 */
async function testTelegram(creds: Record<string, string>): Promise<TestResult> {
  const { botToken } = creds
  if (!botToken) {
    return { success: false, message: 'botToken 필요', error: 'missing_fields' }
  }

  try {
    const response = await axios.get(
      `https://api.telegram.org/bot${botToken}/getMe`,
      { timeout: 10000 },
    )

    if (response.data?.ok) {
      const botName = response.data.result?.username ?? 'unknown'
      return { success: true, message: `봇 연결 성공: @${botName}` }
    }
    return { success: false, message: 'Telegram API 응답 이상', error: JSON.stringify(response.data) }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    return { success: false, message: 'Telegram 봇 인증 실패', error: errMsg }
  }
}

/**
 * 도매꾹 — 로그인 시도 (세션 쿠키 획득)
 */
async function testDomaegguk(creds: Record<string, string>): Promise<TestResult> {
  const { username, password } = creds
  if (!username || !password) {
    return { success: false, message: 'username, password 필요', error: 'missing_fields' }
  }

  try {
    const response = await axios.post(
      'https://domeggook.com/main/member/login_ok.php',
      new URLSearchParams({ id: username, pw: password }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
        maxRedirects: 0,
        validateStatus: (s) => s >= 200 && s < 400,
      },
    )

    // 로그인 성공 시 보통 302 리다이렉트 + Set-Cookie
    const setCookie = response.headers['set-cookie']
    if (setCookie && setCookie.length > 0) {
      return { success: true, message: '도매꾹 로그인 성공' }
    }
    return { success: false, message: '로그인 실패 (쿠키 없음)', error: 'no_session_cookie' }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    return { success: false, message: '도매꾹 로그인 실패', error: errMsg }
  }
}

/**
 * 오너클랜 — 로그인 시도 (세션 쿠키 획득)
 */
async function testOwnerclan(creds: Record<string, string>): Promise<TestResult> {
  const { username, password } = creds
  if (!username || !password) {
    return { success: false, message: 'username, password 필요', error: 'missing_fields' }
  }

  try {
    const response = await axios.post(
      'https://www.ownerclan.com/V2/member/login_ok.php',
      new URLSearchParams({ id: username, pw: password }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
        maxRedirects: 0,
        validateStatus: (s) => s >= 200 && s < 400,
      },
    )

    const setCookie = response.headers['set-cookie']
    if (setCookie && setCookie.length > 0) {
      return { success: true, message: '오너클랜 로그인 성공' }
    }
    return { success: false, message: '로그인 실패 (쿠키 없음)', error: 'no_session_cookie' }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    return { success: false, message: '오너클랜 로그인 실패', error: errMsg }
  }
}

/**
 * 온채널 — 로그인 시도 (세션 쿠키 획득)
 */
async function testOnchannel(creds: Record<string, string>): Promise<TestResult> {
  const { username, password } = creds
  if (!username || !password) {
    return { success: false, message: 'username, password 필요', error: 'missing_fields' }
  }

  try {
    const response = await axios.post(
      'https://onchannel.co.kr/member/login_ok',
      new URLSearchParams({ member_id: username, member_passwd: password }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
        maxRedirects: 0,
        validateStatus: (s) => s >= 200 && s < 400,
      },
    )

    const setCookie = response.headers['set-cookie']
    if (setCookie && setCookie.length > 0) {
      return { success: true, message: '온채널 로그인 성공' }
    }
    return { success: false, message: '로그인 실패 (쿠키 없음)', error: 'no_session_cookie' }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    return { success: false, message: '온채널 로그인 실패', error: errMsg }
  }
}
