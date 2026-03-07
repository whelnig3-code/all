// =============================================
// AES-256-GCM 암호화 모듈 단위 테스트
// =============================================
import { encryptPhone, decryptPhone } from './encryption'

// 테스트용 32바이트 키 (hex 64자)
const TEST_KEY_HEX = 'a'.repeat(64)
// 테스트용 32바이트 키 (base64 — 32바이트 = 44자 base64)
const TEST_KEY_B64 = Buffer.alloc(32, 0xab).toString('base64')

describe('encryptPhone', () => {
  beforeEach(() => {
    process.env['MASTER_ENCRYPTION_KEY'] = TEST_KEY_HEX
  })

  afterEach(() => {
    delete process.env['MASTER_ENCRYPTION_KEY']
  })

  it('encrypt→decrypt 라운드트립 (hex 키)', () => {
    const phone = '010-1234-5678'
    const payload = encryptPhone(phone)

    expect(payload.ciphertext).toBeDefined()
    expect(payload.iv).toBeDefined()
    expect(payload.authTag).toBeDefined()

    // IV: 12 bytes, authTag: 16 bytes
    expect(Buffer.from(payload.iv, 'base64')).toHaveLength(12)
    expect(Buffer.from(payload.authTag, 'base64')).toHaveLength(16)

    expect(decryptPhone(payload)).toBe(phone)
  })

  it('encrypt→decrypt 라운드트립 (base64 키)', () => {
    process.env['MASTER_ENCRYPTION_KEY'] = TEST_KEY_B64
    const phone = '010-9876-5432'
    expect(decryptPhone(encryptPhone(phone))).toBe(phone)
  })

  it('동일 평문도 매번 다른 IV 생성 (랜덤성)', () => {
    const phone = '010-1111-2222'
    const p1 = encryptPhone(phone)
    const p2 = encryptPhone(phone)
    expect(p1.iv).not.toBe(p2.iv)
    expect(p1.ciphertext).not.toBe(p2.ciphertext)
  })

  it('MASTER_ENCRYPTION_KEY 미설정 시 에러', () => {
    delete process.env['MASTER_ENCRYPTION_KEY']
    expect(() => encryptPhone('010-1234-5678')).toThrow('MASTER_ENCRYPTION_KEY')
  })

  it('키 길이 부족 시 에러 (32바이트 미만)', () => {
    // 'tooshort' → base64 디코딩 시 6바이트 (32바이트 필요)
    process.env['MASTER_ENCRYPTION_KEY'] = 'tooshort'
    expect(() => encryptPhone('010-1234-5678')).toThrow('32바이트')
  })

  it('빈 문자열 입력 시 에러', () => {
    expect(() => encryptPhone('')).toThrow('비어있습니다')
  })
})

describe('decryptPhone', () => {
  beforeEach(() => {
    process.env['MASTER_ENCRYPTION_KEY'] = TEST_KEY_HEX
  })

  afterEach(() => {
    delete process.env['MASTER_ENCRYPTION_KEY']
  })

  it('authTag 변조 시 복호화 실패 (무결성 검증)', () => {
    const payload = encryptPhone('010-1234-5678')
    const tampered = {
      ...payload,
      authTag: Buffer.alloc(16, 0xff).toString('base64'),
    }
    expect(() => decryptPhone(tampered)).toThrow()
  })

  it('IV 변조 시 복호화 실패', () => {
    const payload = encryptPhone('010-1234-5678')
    const tampered = {
      ...payload,
      iv: Buffer.alloc(12, 0x00).toString('base64'),
    }
    expect(() => decryptPhone(tampered)).toThrow()
  })
})
