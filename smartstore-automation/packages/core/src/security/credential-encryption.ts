// =============================================
// 범용 자격증명 JSON 암호화/복호화 모듈
// - AES-256-GCM (기존 encryption.ts와 동일 알고리즘)
// - Record<string, string> → 암호화 JSON blob
// - MASTER_ENCRYPTION_KEY 환경변수 공유
// =============================================

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

/** 암호화된 자격증명 페이로드 */
export interface EncryptedCredentials {
  /** 암호문 (base64) */
  ciphertext: string
  /** 초기화 벡터 (base64, 12 bytes) */
  iv: string
  /** 인증 태그 (base64, 16 bytes) */
  authTag: string
}

function loadEncryptionKey(): Buffer {
  const raw = process.env['MASTER_ENCRYPTION_KEY']
  if (!raw) {
    throw new Error(
      'MASTER_ENCRYPTION_KEY 환경변수가 설정되지 않았습니다. ' +
      '생성 명령: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    )
  }

  const isHex64 = /^[0-9a-fA-F]{64}$/.test(raw)
  const keyBuf = isHex64 ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')

  if (keyBuf.length !== 32) {
    throw new Error(
      `MASTER_ENCRYPTION_KEY는 32바이트여야 합니다 (현재: ${keyBuf.length}바이트).`
    )
  }

  return keyBuf
}

/**
 * 자격증명 JSON 암호화
 *
 * @param data key-value 자격증명 (빈 객체 불가)
 * @returns 암호화 페이로드
 */
export function encryptCredentials(data: Record<string, string>): EncryptedCredentials {
  if (Object.keys(data).length === 0) {
    throw new Error('암호화할 자격증명이 비어있습니다.')
  }

  const key = loadEncryptionKey()
  const iv = randomBytes(12)
  const plain = JSON.stringify(data)

  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  }
}

/**
 * 자격증명 JSON 복호화
 *
 * @param payload 암호화된 페이로드
 * @returns 복호화된 key-value 자격증명
 * @throws authTag 불일치 시 에러 (변조 감지)
 */
export function decryptCredentials(payload: EncryptedCredentials): Record<string, string> {
  const { ciphertext, iv, authTag } = payload

  const key = loadEncryptionKey()
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(authTag, 'base64'))

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ])

  return JSON.parse(decrypted.toString('utf8'))
}
