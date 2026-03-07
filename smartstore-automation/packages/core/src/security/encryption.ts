// =============================================
// AES-256-GCM 전화번호 암호화 모듈
// - Node.js built-in crypto 모듈만 사용 (외부 의존성 없음)
// - env: MASTER_ENCRYPTION_KEY (32바이트, hex 64자 또는 base64)
// =============================================

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

/** 암호화된 전화번호 페이로드 */
export interface EncryptedPhone {
  /** 암호문 (base64) */
  ciphertext: string
  /** 초기화 벡터 (base64, 12 bytes) */
  iv: string
  /** 인증 태그 (base64, 16 bytes) */
  authTag: string
}

/**
 * MASTER_ENCRYPTION_KEY 환경변수 로드 및 32바이트 검증
 * - hex 64자 또는 base64 지원
 * - 런타임에 길이 검증 (잘못된 키는 즉시 에러)
 */
function loadEncryptionKey(): Buffer {
  const raw = process.env['MASTER_ENCRYPTION_KEY']
  if (!raw) {
    throw new Error(
      'MASTER_ENCRYPTION_KEY 환경변수가 설정되지 않았습니다. ' +
      '생성 명령: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    )
  }

  // hex 64자 = 32바이트인 경우 hex로 디코딩, 아니면 base64로 시도
  const isHex64 = /^[0-9a-fA-F]{64}$/.test(raw)
  const keyBuf = isHex64 ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')

  if (keyBuf.length !== 32) {
    throw new Error(
      `MASTER_ENCRYPTION_KEY는 32바이트여야 합니다 (현재: ${keyBuf.length}바이트). ` +
      'hex 64자 또는 base64 44자로 제공하세요.'
    )
  }

  return keyBuf
}

/**
 * 전화번호 AES-256-GCM 암호화
 *
 * @param plain 평문 전화번호 (비어있으면 에러)
 * @returns 암호화 페이로드 (ciphertext / iv / authTag 모두 base64)
 */
export function encryptPhone(plain: string): EncryptedPhone {
  if (!plain) {
    throw new Error('암호화할 전화번호가 비어있습니다.')
  }

  const key = loadEncryptionKey()
  const iv = randomBytes(12) // GCM 권장 IV 크기: 12 bytes

  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag() // 16 bytes

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  }
}

/**
 * 전화번호 AES-256-GCM 복호화
 *
 * @param payload 암호화된 페이로드
 * @returns 복호화된 평문 전화번호
 * @throws authTag 불일치 시 에러 (변조 감지)
 */
export function decryptPhone(payload: EncryptedPhone): string {
  const { ciphertext, iv, authTag } = payload

  const key = loadEncryptionKey()
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(authTag, 'base64'))

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ])

  return decrypted.toString('utf8')
}
