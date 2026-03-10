// =============================================
// 네이버 커머스 API 이미지 업로드 모듈
// - multipart/form-data로 이미지 업로드
// - NAVER_IMAGE_UPLOAD_ENABLED=false 시 빈 배열 반환
// - 실패 시 빈 배열 반환 (degrade — 등록 중단 금지)
// =============================================

import axios from 'axios'
import FormData from 'form-data'
import fs from 'fs'
import path from 'path'
import { config, createLogger } from '@smartstore/shared'

const logger = createLogger('naver-image-upload')

// =============================================
// contentType 자동 감지
// =============================================

const CONTENT_TYPE_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

/**
 * 파일 확장자 기반 Content-Type 감지
 * 미지원 확장자 또는 확장자 없음 -> image/jpeg (기본값)
 */
export function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  return CONTENT_TYPE_MAP[ext] ?? 'image/jpeg'
}

// =============================================
// 토큰 캐싱
// =============================================

let cachedToken: { token: string; expiresAt: number } | null = null

/**
 * 캐시된 액세스 토큰 반환. 만료 전까지 재사용.
 * 안전 마진 5분 (토큰 유효기간 30분 가정, 25분 후 만료 처리)
 */
async function getAccessTokenCached(
  baseUrl: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token
  }
  const token = await getAccessToken(baseUrl, clientId, clientSecret)
  cachedToken = { token, expiresAt: Date.now() + 25 * 60 * 1000 }
  return token
}

/**
 * 토큰 캐시 초기화 (테스트용)
 */
export function clearTokenCache(): void {
  cachedToken = null
}

/** 네이버 이미지 업로드 응답 타입 */
interface NaverImageUploadResponse {
  images: Array<{ url: string }>
}

/**
 * bcrypt 서명 생성 (네이버 커머스 API 인증)
 */
function generateSignature(clientId: string, clientSecret: string, timestamp: number): string {
  const bcrypt = require('bcrypt')
  const password = `${clientId}_${timestamp}`
  const hashed = bcrypt.hashSync(password, clientSecret)
  return Buffer.from(hashed, 'utf-8').toString('base64')
}

/**
 * 네이버 액세스 토큰 발급
 */
async function getAccessToken(baseUrl: string, clientId: string, clientSecret: string): Promise<string> {
  const timestamp = Date.now()
  const signature = generateSignature(clientId, clientSecret, timestamp)

  const response = await axios.post(
    `${baseUrl}/external/v1/oauth2/token`,
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
    }
  )
  return response.data.access_token as string
}

/**
 * 단일 이미지 파일을 네이버 이미지 서버에 업로드
 * @returns 업로드된 이미지 URL, 실패 시 null
 */
async function uploadSingleImage(
  filePath: string,
  token: string,
  baseUrl: string
): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const form = new FormData()
      const filename = path.basename(filePath)
      form.append('imageFiles', fs.createReadStream(filePath), {
        filename,
        contentType: getContentType(filePath),
      })

      const response = await axios.post<NaverImageUploadResponse>(
        `${baseUrl}/external/v1/product-images/upload`,
        form,
        {
          headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${token}`,
          },
          timeout: 30000,
        }
      )

      const uploadedUrl = response.data.images?.[0]?.url ?? ''
      logger.info('이미지 업로드 성공', { filename, url: uploadedUrl })
      return uploadedUrl || null
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (attempt === 0) {
        logger.warn('이미지 업로드 재시도', { filePath, attempt, reason: message })
        await new Promise((r) => setTimeout(r, 1000))
        continue
      }
      logger.warn('naver_upload_failed', { filePath, reason: message })
      return null
    }
  }
  return null
}

/**
 * 이미지 파일 배열을 네이버에 업로드
 * @param paths 업로드할 이미지 로컬 경로 배열
 * @returns 성공한 이미지 URL 배열 (실패 시 빈 배열 — degrade)
 */
export async function uploadProductImages(paths: string[]): Promise<string[]> {
  // 업로드 비활성화 설정 확인
  const uploadEnabled = process.env['NAVER_IMAGE_UPLOAD_ENABLED'] !== 'false'
  if (!uploadEnabled) {
    logger.info('이미지 업로드 비활성화 (NAVER_IMAGE_UPLOAD_ENABLED=false)')
    return []
  }

  if (paths.length === 0) return []

  const baseUrl = config.naver.apiBaseUrl
  const clientId = config.naver.clientId
  const clientSecret = config.naver.clientSecret

  try {
    // 토큰 발급
    const token = await getAccessTokenCached(baseUrl, clientId, clientSecret)

    // 각 이미지 순차 업로드 (실패해도 계속 진행)
    const urls: string[] = []
    for (const filePath of paths) {
      const url = await uploadSingleImage(filePath, token, baseUrl)
      if (url) {
        urls.push(url)
      }
    }

    if (urls.length < paths.length) {
      logger.warn('일부 이미지 업로드 실패', {
        total: paths.length,
        success: urls.length,
      })
    }

    return urls
  } catch (error) {
    // 토큰 발급 실패 등 — 전체 실패 처리 (degrade)
    const message = error instanceof Error ? error.message : String(error)
    logger.warn('naver_upload_failed', { reason: message, paths })
    return []
  }
}
