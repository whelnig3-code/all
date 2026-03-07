/** 암호화된 자격증명 페이로드 */
export interface EncryptedCredentials {
    /** 암호문 (base64) */
    ciphertext: string;
    /** 초기화 벡터 (base64, 12 bytes) */
    iv: string;
    /** 인증 태그 (base64, 16 bytes) */
    authTag: string;
}
/**
 * 자격증명 JSON 암호화
 *
 * @param data key-value 자격증명 (빈 객체 불가)
 * @returns 암호화 페이로드
 */
export declare function encryptCredentials(data: Record<string, string>): EncryptedCredentials;
/**
 * 자격증명 JSON 복호화
 *
 * @param payload 암호화된 페이로드
 * @returns 복호화된 key-value 자격증명
 * @throws authTag 불일치 시 에러 (변조 감지)
 */
export declare function decryptCredentials(payload: EncryptedCredentials): Record<string, string>;
//# sourceMappingURL=credential-encryption.d.ts.map