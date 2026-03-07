export type ServiceType = 'naver_commerce' | 'naver_blog' | 'domaegguk' | 'ownerclan' | 'telegram';
export type CredentialStatus = 'configured' | 'not_configured' | 'test_failed';
export interface ServiceStatusInfo {
    service: ServiceType;
    status: CredentialStatus;
    lastTestedAt: Date | null;
    testError: string | null;
    fields: Record<string, string>;
}
export declare const SERVICE_ENV_MAP: Record<ServiceType, Record<string, string>>;
/** 테스트용 캐시 초기화 */
export declare function _clearCacheForTest(): void;
/**
 * 서비스 자격증명 조회
 * 1. 캐시 확인
 * 2. DB 조회 → 복호화
 * 3. .env 폴백
 * 4. 모두 없으면 null
 */
export declare function getCredentials(service: ServiceType): Promise<Record<string, string> | null>;
/**
 * 자격증명 저장 (암호화 → DB upsert)
 */
export declare function saveCredentials(service: ServiceType, data: Record<string, string>): Promise<void>;
/**
 * 자격증명 삭제
 */
export declare function deleteCredentials(service: ServiceType): Promise<void>;
/**
 * 서비스 자격증명 상태 조회
 */
export declare function getCredentialStatus(service: ServiceType): Promise<CredentialStatus>;
/**
 * 서비스 자격증명이 사용 가능한지 확인 (게이트 체크용)
 */
export declare function isServiceReady(service: ServiceType): Promise<boolean>;
/**
 * 전체 서비스 상태 목록 조회
 */
export declare function getAllServiceStatuses(): Promise<ServiceStatusInfo[]>;
/**
 * 값 마스킹: 앞 4자 + **** + 뒤 3자
 * 7자 이하이면 전체 ****
 */
export declare function maskValue(value: string): string;
//# sourceMappingURL=credential-service.d.ts.map