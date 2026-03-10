// =============================================
// 자격증명 서비스 단위 테스트 (TDD)
//
// 검증 항목:
//   1. DB에서 자격증명 조회 + 복호화
//   2. 자격증명 저장 (암호화 → DB)
//   3. .env 폴백 (DB 미설정 시)
//   4. 서비스 상태 조회
//   5. isServiceReady 게이트 체크
//   6. 메모리 캐시 (TTL 내 재조회 없음)
// =============================================

import type { ServiceType } from './credential-service'

// =============================================
// Mock 선언
// =============================================

const mockFindUnique = jest.fn()
const mockUpsert = jest.fn()
const mockDelete = jest.fn()
const mockUpdate = jest.fn()

jest.mock('@smartstore/db', () => ({
  prisma: {
    serviceCredential: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}))

jest.mock('../security/credential-encryption', () => ({
  encryptCredentials: jest.fn().mockReturnValue({
    ciphertext: 'encrypted-blob',
    iv: 'test-iv',
    authTag: 'test-tag',
  }),
  decryptCredentials: jest.fn().mockReturnValue({
    clientId: 'dec-id',
    clientSecret: 'dec-secret',
  }),
}))

// =============================================
// Import (mock 이후)
// =============================================

import {
  getCredentials,
  saveCredentials,
  deleteCredentials,
  getCredentialStatus,
  isServiceReady,
  getAllServiceStatuses,
  maskValue,
  _clearCacheForTest,
  SERVICE_ENV_MAP,
} from './credential-service'

import { encryptCredentials, decryptCredentials } from '../security/credential-encryption'

// =============================================
// 테스트
// =============================================

describe('credential-service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    _clearCacheForTest()
    // .env 값 클리어
    delete process.env['NAVER_CLIENT_ID']
    delete process.env['NAVER_CLIENT_SECRET']
    delete process.env['NAVER_SHOP_ID']
    delete process.env['TELEGRAM_BOT_TOKEN']
    delete process.env['TELEGRAM_CHAT_ID']
  })

  // ---- getCredentials ----

  it('DB에 자격증명 존재 → 복호화 결과 반환', async () => {
    mockFindUnique.mockResolvedValue({
      service: 'naver_commerce',
      credentials: 'encrypted-blob',
      iv: 'test-iv',
      authTag: 'test-tag',
    })

    const result = await getCredentials('naver_commerce')

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { service: 'naver_commerce' },
    })
    expect(decryptCredentials).toHaveBeenCalledWith({
      ciphertext: 'encrypted-blob',
      iv: 'test-iv',
      authTag: 'test-tag',
    })
    expect(result).toEqual({ clientId: 'dec-id', clientSecret: 'dec-secret' })
  })

  it('DB 미존재 + .env 설정됨 → .env 값 반환', async () => {
    mockFindUnique.mockResolvedValue(null)
    process.env['NAVER_CLIENT_ID'] = 'env-client-id'
    process.env['NAVER_CLIENT_SECRET'] = 'env-secret'
    process.env['NAVER_SHOP_ID'] = 'env-shop'

    const result = await getCredentials('naver_commerce')

    expect(result).toEqual({
      clientId: 'env-client-id',
      clientSecret: 'env-secret',
      shopId: 'env-shop',
    })
  })

  it('DB 미존재 + .env 미설정 → null 반환', async () => {
    mockFindUnique.mockResolvedValue(null)

    const result = await getCredentials('naver_commerce')

    expect(result).toBeNull()
  })

  it('.env 일부만 설정 → null 반환 (모든 필수 필드 필요)', async () => {
    mockFindUnique.mockResolvedValue(null)
    process.env['NAVER_CLIENT_ID'] = 'only-id'
    // clientSecret, shopId 미설정

    const result = await getCredentials('naver_commerce')

    expect(result).toBeNull()
  })

  // ---- saveCredentials ----

  it('saveCredentials → 암호화 후 DB upsert', async () => {
    mockUpsert.mockResolvedValue({})

    await saveCredentials('naver_commerce', {
      clientId: 'new-id',
      clientSecret: 'new-secret',
      shopId: 'new-shop',
    })

    expect(encryptCredentials).toHaveBeenCalledWith({
      clientId: 'new-id',
      clientSecret: 'new-secret',
      shopId: 'new-shop',
    })
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { service: 'naver_commerce' },
        create: expect.objectContaining({
          service: 'naver_commerce',
          credentials: 'encrypted-blob',
          iv: 'test-iv',
          authTag: 'test-tag',
        }),
        update: expect.objectContaining({
          credentials: 'encrypted-blob',
          iv: 'test-iv',
          authTag: 'test-tag',
        }),
      }),
    )
  })

  // ---- deleteCredentials ----

  it('deleteCredentials → DB 삭제', async () => {
    mockDelete.mockResolvedValue({})

    await deleteCredentials('naver_commerce')

    expect(mockDelete).toHaveBeenCalledWith({
      where: { service: 'naver_commerce' },
    })
  })

  // ---- getCredentialStatus ----

  it('DB 존재 + 테스트 성공 → configured', async () => {
    mockFindUnique.mockResolvedValue({
      service: 'telegram',
      credentials: 'enc',
      iv: 'iv',
      authTag: 'tag',
      testResult: 'success',
      lastTestedAt: new Date(),
    })

    const status = await getCredentialStatus('telegram')

    expect(status).toBe('configured')
  })

  it('DB 존재 + 테스트 실패 → test_failed', async () => {
    mockFindUnique.mockResolvedValue({
      service: 'telegram',
      credentials: 'enc',
      iv: 'iv',
      authTag: 'tag',
      testResult: 'failed',
      testError: 'Bot token invalid',
    })

    const status = await getCredentialStatus('telegram')

    expect(status).toBe('test_failed')
  })

  it('DB 미존재 + .env 미설정 → not_configured', async () => {
    mockFindUnique.mockResolvedValue(null)

    const status = await getCredentialStatus('telegram')

    expect(status).toBe('not_configured')
  })

  // ---- isServiceReady ----

  it('DB 자격증명 존재 → true', async () => {
    mockFindUnique.mockResolvedValue({
      service: 'naver_commerce',
      credentials: 'enc',
      iv: 'iv',
      authTag: 'tag',
    })

    const ready = await isServiceReady('naver_commerce')
    expect(ready).toBe(true)
  })

  it('DB/ENV 모두 미설정 → false', async () => {
    mockFindUnique.mockResolvedValue(null)

    const ready = await isServiceReady('naver_commerce')
    expect(ready).toBe(false)
  })

  // ---- maskValue ----

  it('긴 값 마스킹: 앞 4자 + **** + 뒤 3자', () => {
    expect(maskValue('sk-proj-abcdefghijklm')).toBe('sk-p****klm')
  })

  it('짧은 값 마스킹: 전체 ****', () => {
    expect(maskValue('abc')).toBe('****')
  })

  // ---- 캐시 ----

  it('두 번째 호출 시 DB 재조회 없음 (캐시 히트)', async () => {
    mockFindUnique.mockResolvedValue({
      service: 'naver_commerce',
      credentials: 'enc',
      iv: 'iv',
      authTag: 'tag',
    })

    await getCredentials('naver_commerce')
    await getCredentials('naver_commerce')

    // DB는 1번만 호출
    expect(mockFindUnique).toHaveBeenCalledTimes(1)
  })

  it('saveCredentials 후 캐시 무효화 → 다음 조회 시 DB 재조회', async () => {
    mockFindUnique.mockResolvedValue({
      service: 'naver_commerce',
      credentials: 'enc',
      iv: 'iv',
      authTag: 'tag',
    })
    mockUpsert.mockResolvedValue({})

    await getCredentials('naver_commerce') // 캐시 저장
    await saveCredentials('naver_commerce', { clientId: 'x', clientSecret: 'y', shopId: 'z' }) // 캐시 무효화
    await getCredentials('naver_commerce') // DB 재조회

    expect(mockFindUnique).toHaveBeenCalledTimes(2)
  })
})
