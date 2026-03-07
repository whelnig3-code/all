// =============================================
// 자격증명 관리 서비스
// - DB 암호화 저장/조회 (AES-256-GCM)
// - .env 폴백 (DB 미설정 시)
// - 메모리 캐시 (TTL 5분)
// =============================================

import { prisma } from '@smartstore/db'
import {
  encryptCredentials,
  decryptCredentials,
  type EncryptedCredentials,
} from '../security/credential-encryption'

// =============================================
// 타입 정의
// =============================================

export type ServiceType =
  | 'naver_commerce'
  | 'naver_blog'
  | 'naver_talktalk'
  | 'domaegguk'
  | 'ownerclan'
  | 'telegram'

export type CredentialStatus = 'configured' | 'not_configured' | 'test_failed'

export interface ServiceStatusInfo {
  service: ServiceType
  status: CredentialStatus
  lastTestedAt: Date | null
  testError: string | null
  fields: Record<string, string> // 마스킹된 값
}

// =============================================
// .env 폴백 매핑
// =============================================

export const SERVICE_ENV_MAP: Record<ServiceType, Record<string, string>> = {
  naver_commerce: {
    clientId: 'NAVER_CLIENT_ID',
    clientSecret: 'NAVER_CLIENT_SECRET',
    shopId: 'NAVER_SHOP_ID',
  },
  naver_blog: {
    accessToken: 'NAVER_BLOG_ACCESS_TOKEN',
  },
  domaegguk: {
    username: 'DOMAEGGUK_USERNAME',
    password: 'DOMAEGGUK_PASSWORD',
  },
  ownerclan: {
    username: 'OWNERCLAN_USERNAME',
    password: 'OWNERCLAN_PASSWORD',
  },
  naver_talktalk: {
    clientId: 'NAVER_CLIENT_ID',
    clientSecret: 'NAVER_CLIENT_SECRET',
    shopId: 'NAVER_SHOP_ID',
  },
  telegram: {
    botToken: 'TELEGRAM_BOT_TOKEN',
    chatId: 'TELEGRAM_CHAT_ID',
  },
}

// =============================================
// 메모리 캐시
// =============================================

const CACHE_TTL_MS = 5 * 60 * 1000 // 5분

interface CacheEntry {
  data: Record<string, string> | null
  expiresAt: number
}

const cache = new Map<ServiceType, CacheEntry>()

/** 테스트용 캐시 초기화 */
export function _clearCacheForTest(): void {
  cache.clear()
}

// =============================================
// 핵심 함수
// =============================================

/**
 * 서비스 자격증명 조회
 * 1. 캐시 확인
 * 2. DB 조회 → 복호화
 * 3. .env 폴백
 * 4. 모두 없으면 null
 */
export async function getCredentials(
  service: ServiceType,
): Promise<Record<string, string> | null> {
  // 캐시 확인
  const cached = cache.get(service)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data
  }

  // DB 조회
  const row = await prisma.serviceCredential.findUnique({
    where: { service },
  })

  if (row) {
    const decrypted = decryptCredentials({
      ciphertext: row.credentials,
      iv: row.iv,
      authTag: row.authTag,
    })
    cache.set(service, { data: decrypted, expiresAt: Date.now() + CACHE_TTL_MS })
    return decrypted
  }

  // .env 폴백
  const envResult = getEnvFallback(service)
  cache.set(service, { data: envResult, expiresAt: Date.now() + CACHE_TTL_MS })
  return envResult
}

/**
 * 자격증명 저장 (암호화 → DB upsert)
 */
export async function saveCredentials(
  service: ServiceType,
  data: Record<string, string>,
): Promise<void> {
  const encrypted = encryptCredentials(data)

  await prisma.serviceCredential.upsert({
    where: { service },
    create: {
      service,
      credentials: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
    },
    update: {
      credentials: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      testResult: null,
      testError: null,
      lastTestedAt: null,
    },
  })

  // 캐시 무효화
  cache.delete(service)
}

/**
 * 자격증명 삭제
 */
export async function deleteCredentials(service: ServiceType): Promise<void> {
  await prisma.serviceCredential.delete({
    where: { service },
  })
  cache.delete(service)
}

/**
 * 서비스 자격증명 상태 조회
 */
export async function getCredentialStatus(
  service: ServiceType,
): Promise<CredentialStatus> {
  const row = await prisma.serviceCredential.findUnique({
    where: { service },
  })

  if (row) {
    if (row.testResult === 'failed') return 'test_failed'
    return 'configured'
  }

  // .env 폴백 확인
  const envResult = getEnvFallback(service)
  if (envResult) return 'configured'

  return 'not_configured'
}

/**
 * 서비스 자격증명이 사용 가능한지 확인 (게이트 체크용)
 */
export async function isServiceReady(service: ServiceType): Promise<boolean> {
  const creds = await getCredentials(service)
  return creds !== null
}

/**
 * 전체 서비스 상태 목록 조회
 */
export async function getAllServiceStatuses(): Promise<ServiceStatusInfo[]> {
  const services: ServiceType[] = [
    'naver_commerce',
    'naver_blog',
    'domaegguk',
    'ownerclan',
    'telegram',
  ]

  return Promise.all(
    services.map(async (service) => {
      const status = await getCredentialStatus(service)
      const creds = await getCredentials(service)

      const maskedFields: Record<string, string> = {}
      if (creds) {
        for (const [key, value] of Object.entries(creds)) {
          maskedFields[key] = maskValue(value)
        }
      }

      const row = await prisma.serviceCredential.findUnique({
        where: { service },
      })

      return {
        service,
        status,
        lastTestedAt: row?.lastTestedAt ?? null,
        testError: row?.testError ?? null,
        fields: maskedFields,
      }
    }),
  )
}

/**
 * 값 마스킹: 앞 4자 + **** + 뒤 3자
 * 7자 이하이면 전체 ****
 */
export function maskValue(value: string): string {
  if (value.length <= 7) return '****'
  return `${value.slice(0, 4)}****${value.slice(-3)}`
}

// =============================================
// 내부 헬퍼
// =============================================

/**
 * .env 환경변수에서 자격증명 조회
 * 모든 필드가 설정되어 있어야 유효 (일부만 → null)
 */
function getEnvFallback(service: ServiceType): Record<string, string> | null {
  const envMap = SERVICE_ENV_MAP[service]
  const result: Record<string, string> = {}

  for (const [field, envKey] of Object.entries(envMap)) {
    const value = process.env[envKey]
    if (!value) return null // 하나라도 없으면 전체 null
    result[field] = value
  }

  return result
}
