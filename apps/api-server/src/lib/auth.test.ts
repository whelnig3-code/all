// =============================================
// Basic Auth 헬퍼 테스트
// =============================================

import { verifyBasicAuth } from './auth'

/** base64 인코딩 헬퍼 */
function encode(user: string, pass: string): string {
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
}

describe('verifyBasicAuth', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      ADMIN_USER: 'admin',
      ADMIN_PASS: 'secret123',
    }
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it('유효한 자격증명 → true', () => {
    expect(verifyBasicAuth(encode('admin', 'secret123'))).toBe(true)
  })

  it('헤더 누락 → false', () => {
    expect(verifyBasicAuth(undefined)).toBe(false)
  })

  it('Basic 접두사 없음 → false', () => {
    const encoded = Buffer.from('admin:secret123').toString('base64')
    expect(verifyBasicAuth(`Bearer ${encoded}`)).toBe(false)
  })

  it('잘못된 base64 → false', () => {
    expect(verifyBasicAuth('Basic !!!invalid-base64!!!')).toBe(false)
  })

  it('잘못된 사용자 → false', () => {
    expect(verifyBasicAuth(encode('wrong', 'secret123'))).toBe(false)
  })

  it('잘못된 비밀번호 → false', () => {
    expect(verifyBasicAuth(encode('admin', 'wrong'))).toBe(false)
  })

  it('콜론 없는 디코딩 값 → false', () => {
    const noColon = 'Basic ' + Buffer.from('nocolonhere').toString('base64')
    expect(verifyBasicAuth(noColon)).toBe(false)
  })
})
