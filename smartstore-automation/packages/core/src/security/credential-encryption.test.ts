// =============================================
// 범용 자격증명 JSON 암호화/복호화 테스트 (TDD RED)
//
// 검증 항목:
//   1. 라운드트립 (암호화 → 복호화 → 원본 일치)
//   2. IV 랜덤성 (동일 입력 → 다른 암호문)
//   3. 빈 객체 거부
//   4. 변조 감지 (authTag 변경 시 복호화 실패)
// =============================================

import { encryptCredentials, decryptCredentials } from './credential-encryption'

const TEST_KEY_HEX = 'a'.repeat(64) // 32바이트 hex 키

describe('credential-encryption', () => {
  beforeEach(() => {
    process.env['MASTER_ENCRYPTION_KEY'] = TEST_KEY_HEX
  })

  afterEach(() => {
    delete process.env['MASTER_ENCRYPTION_KEY']
  })

  it('라운드트립: 암호화 → 복호화 → 원본 일치', () => {
    const original = {
      clientId: 'test-client-id',
      clientSecret: 'super-secret-value-123',
      shopId: 'shop-456',
    }

    const encrypted = encryptCredentials(original)
    const decrypted = decryptCredentials(encrypted)

    expect(decrypted).toEqual(original)
  })

  it('IV 랜덤성: 동일 입력 → 서로 다른 암호문', () => {
    const data = { token: 'same-value' }

    const enc1 = encryptCredentials(data)
    const enc2 = encryptCredentials(data)

    expect(enc1.ciphertext).not.toBe(enc2.ciphertext)
    expect(enc1.iv).not.toBe(enc2.iv)
  })

  it('빈 객체 → 에러', () => {
    expect(() => encryptCredentials({})).toThrow('비어있')
  })

  it('변조 감지: authTag 변경 시 복호화 실패', () => {
    const data = { username: 'admin', password: 'pw123' }
    const encrypted = encryptCredentials(data)

    const tampered = {
      ...encrypted,
      authTag: Buffer.from('tampered-tag-value!!').toString('base64'),
    }

    expect(() => decryptCredentials(tampered)).toThrow()
  })

  it('한글 값 암호화/복호화 정상', () => {
    const data = { username: '테스트유저', password: '비밀번호123' }

    const encrypted = encryptCredentials(data)
    const decrypted = decryptCredentials(encrypted)

    expect(decrypted).toEqual(data)
  })

  it('MASTER_ENCRYPTION_KEY 미설정 시 에러', () => {
    delete process.env['MASTER_ENCRYPTION_KEY']

    expect(() => encryptCredentials({ key: 'val' })).toThrow('MASTER_ENCRYPTION_KEY')
  })
})
