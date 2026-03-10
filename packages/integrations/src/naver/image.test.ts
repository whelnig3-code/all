// =============================================
// 네이버 이미지 업로드 모듈 단위 테스트
// - contentType 자동 감지
// - 토큰 캐싱
// - 업로드 재시도
// =============================================

// bcrypt mock (generateSignature에서 require('bcrypt').hashSync 사용)
jest.mock('bcrypt', () => ({
  hashSync: (password: string, _salt: string) => `bcrypt_hashed_${password}`,
}))

// form-data mock
jest.mock('form-data', () => {
  return jest.fn().mockImplementation(() => ({
    append: jest.fn(),
    getHeaders: jest.fn(() => ({ 'content-type': 'multipart/form-data' })),
  }))
})

// axios mock
jest.mock('axios')
import axios from 'axios'
const mockPost = axios.post as jest.MockedFunction<typeof axios.post>

// fs mock — createReadStream이 스트림 객체를 반환하도록
jest.mock('fs', () => ({
  createReadStream: jest.fn(() => ({ pipe: jest.fn() })),
}))

// @smartstore/shared mock
jest.mock('@smartstore/shared', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
  get config() {
    return {
      naver: {
        apiBaseUrl: 'https://api.commerce.naver.com',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      },
    }
  },
}))

import {
  getContentType,
  uploadProductImages,
  clearTokenCache,
} from './image'

// =============================================
// 헬퍼
// =============================================

/** 토큰 발급 성공 mock */
function mockTokenSuccess(token = 'test-access-token') {
  mockPost.mockResolvedValueOnce({
    data: { access_token: token },
  })
}

/** 이미지 업로드 성공 mock */
function mockUploadSuccess(imageUrl = 'https://shop-phinf.pstatic.net/test.jpg') {
  mockPost.mockResolvedValueOnce({
    data: { images: [{ url: imageUrl }] },
  })
}

/** 이미지 업로드 실패 mock */
function mockUploadFailure(message = 'Upload failed') {
  mockPost.mockRejectedValueOnce(new Error(message))
}

// =============================================
// 작업 1: contentType 자동 감지
// =============================================

describe('getContentType', () => {
  it('.jpg 파일 -> image/jpeg', () => {
    expect(getContentType('/images/photo.jpg')).toBe('image/jpeg')
  })

  it('.jpeg 파일 -> image/jpeg', () => {
    expect(getContentType('/images/photo.jpeg')).toBe('image/jpeg')
  })

  it('.png 파일 -> image/png', () => {
    expect(getContentType('/images/photo.png')).toBe('image/png')
  })

  it('.webp 파일 -> image/webp', () => {
    expect(getContentType('/images/photo.webp')).toBe('image/webp')
  })

  it('.gif 파일 -> image/gif', () => {
    expect(getContentType('/images/photo.gif')).toBe('image/gif')
  })

  it('확장자 없는 파일 -> image/jpeg (기본값)', () => {
    expect(getContentType('/images/photo')).toBe('image/jpeg')
  })

  it('대문자 확장자 -> 정상 감지', () => {
    expect(getContentType('/images/photo.PNG')).toBe('image/png')
  })
})

// =============================================
// 빈 배열 / 비활성화
// =============================================

describe('uploadProductImages — 빈 배열 / 비활성화', () => {
  const originalEnv = process.env

  beforeEach(() => {
    mockPost.mockReset()
    clearTokenCache()
    delete process.env['NAVER_IMAGE_UPLOAD_ENABLED']
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('빈 배열 입력 -> 빈 배열 반환', async () => {
    const result = await uploadProductImages([])
    expect(result).toEqual([])
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('NAVER_IMAGE_UPLOAD_ENABLED=false -> 빈 배열 반환 (API 호출 없음)', async () => {
    process.env['NAVER_IMAGE_UPLOAD_ENABLED'] = 'false'
    const result = await uploadProductImages(['/images/test.jpg'])
    expect(result).toEqual([])
    expect(mockPost).not.toHaveBeenCalled()
  })
})

// =============================================
// 작업 2: 토큰 캐싱
// =============================================

describe('uploadProductImages — 토큰 캐싱', () => {
  beforeEach(() => {
    mockPost.mockReset()
    clearTokenCache()
    delete process.env['NAVER_IMAGE_UPLOAD_ENABLED']
  })

  it('2회 연속 호출 시 토큰 API 1번만 호출 (캐시 적중)', async () => {
    // 1차: 토큰 발급 + 업로드
    mockTokenSuccess('token-1')
    mockUploadSuccess('https://img1.jpg')

    // 2차: 캐시된 토큰 사용 + 업로드
    mockUploadSuccess('https://img2.jpg')

    await uploadProductImages(['/images/a.jpg'])
    await uploadProductImages(['/images/b.jpg'])

    // token API는 1번, upload API는 2번 = 총 post 3번
    expect(mockPost).toHaveBeenCalledTimes(3)

    // 첫 번째 호출이 토큰 발급 (oauth2/token 경로 포함)
    expect(mockPost.mock.calls[0][0]).toContain('oauth2/token')
    // 두 번째는 업로드
    expect(mockPost.mock.calls[1][0]).toContain('product-images/upload')
    // 세 번째는 업로드 (토큰 발급 없이)
    expect(mockPost.mock.calls[2][0]).toContain('product-images/upload')
  })

  it('캐시 만료 후 토큰 재발급', async () => {
    // 1차: 토큰 발급 + 업로드
    mockTokenSuccess('token-1')
    mockUploadSuccess('https://img1.jpg')

    await uploadProductImages(['/images/a.jpg'])

    // 캐시 강제 초기화 (만료 시뮬레이션)
    clearTokenCache()

    // 2차: 새 토큰 발급 + 업로드
    mockTokenSuccess('token-2')
    mockUploadSuccess('https://img2.jpg')

    await uploadProductImages(['/images/b.jpg'])

    // 토큰 API 2번 호출
    const tokenCalls = mockPost.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('oauth2/token')
    )
    expect(tokenCalls).toHaveLength(2)
  })
})

// =============================================
// 작업 3: 업로드 재시도
// =============================================

describe('uploadProductImages — 업로드 재시도', () => {
  beforeEach(() => {
    mockPost.mockReset()
    clearTokenCache()
    delete process.env['NAVER_IMAGE_UPLOAD_ENABLED']
    // setTimeout을 즉시 실행하도록 mock
    jest.spyOn(global, 'setTimeout').mockImplementation((fn: Function) => {
      fn()
      return 0 as unknown as NodeJS.Timeout
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('첫 시도 실패 + 재시도 성공 -> URL 반환', async () => {
    // 토큰 발급
    mockTokenSuccess()
    // 1차 업로드 실패
    mockUploadFailure('timeout')
    // 2차 업로드 성공
    mockUploadSuccess('https://retry-success.jpg')

    const result = await uploadProductImages(['/images/retry.jpg'])
    expect(result).toEqual(['https://retry-success.jpg'])
  })

  it('2회 모두 실패 -> 빈 배열 반환 (degrade)', async () => {
    // 토큰 발급
    mockTokenSuccess()
    // 1차 실패
    mockUploadFailure('fail-1')
    // 2차 실패
    mockUploadFailure('fail-2')

    const result = await uploadProductImages(['/images/fail.jpg'])
    expect(result).toEqual([])
  })
})
