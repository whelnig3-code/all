/** 암호화된 전화번호 페이로드 */
export interface EncryptedPhone {
    /** 암호문 (base64) */
    ciphertext: string;
    /** 초기화 벡터 (base64, 12 bytes) */
    iv: string;
    /** 인증 태그 (base64, 16 bytes) */
    authTag: string;
}
/**
 * 전화번호 AES-256-GCM 암호화
 *
 * @param plain 평문 전화번호 (비어있으면 에러)
 * @returns 암호화 페이로드 (ciphertext / iv / authTag 모두 base64)
 */
export declare function encryptPhone(plain: string): EncryptedPhone;
/**
 * 전화번호 AES-256-GCM 복호화
 *
 * @param payload 암호화된 페이로드
 * @returns 복호화된 평문 전화번호
 * @throws authTag 불일치 시 에러 (변조 감지)
 */
export declare function decryptPhone(payload: EncryptedPhone): string;
//# sourceMappingURL=encryption.d.ts.map