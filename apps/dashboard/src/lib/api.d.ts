/** GET /admin/system 응답 */
export interface SystemStatus {
    workerAlive: boolean;
    dbConnected: boolean;
    redisConnected: boolean;
    memory: {
        heapUsedMB: number;
        rssMB: number;
        heapTotalMB: number;
    };
    competitorQueueDepth: number;
    timestamp: string;
    /** 설정값 (Kill Switch + 셀러 유형) */
    settings: {
        AUTO_PRICE_ENABLED: string;
        AUTO_ORDER_ENABLED: string;
        AUTO_SHIPPING_ENABLED: string;
        SELLER_TYPE: string;
    };
}
/** GET /admin/metrics 응답 */
export interface DailyMetrics {
    totalRevenue: number;
    totalMargin: number;
    orderCount: number;
    fallbackCount: number;
    failedJobCount: number;
    date: string;
}
/** 제어 키 타입 (Kill Switch + 셀러 유형) */
export type ControlKey = 'AUTO_PRICE_ENABLED' | 'AUTO_ORDER_ENABLED' | 'AUTO_SHIPPING_ENABLED' | 'SELLER_TYPE';
/** POST /admin/control 응답 */
export interface ControlResult {
    success: boolean;
    key: string;
    value: string;
    updatedAt: string;
}
/**
 * 시스템 상태 조회 (GET /admin/system)
 * - settings 필드에 Kill Switch 현재값 포함
 */
export declare function fetchSystemStatus(): Promise<SystemStatus>;
/**
 * 오늘 실적 조회 (GET /admin/metrics)
 */
export declare function fetchMetrics(): Promise<DailyMetrics>;
/**
 * 설정 제어 (POST /admin/control)
 * @param key   제어 대상 키
 * @param value Kill Switch: 'true'/'false', SELLER_TYPE: 'individual'/'business'
 */
export declare function updateControl(key: ControlKey, value: string): Promise<ControlResult>;
export type ServiceType = 'naver_commerce' | 'naver_blog' | 'naver_talktalk' | 'domaegguk' | 'ownerclan' | 'onchannel' | 'telegram';
export type CredentialStatus = 'configured' | 'not_configured' | 'test_failed';
export interface ServiceStatusInfo {
    service: ServiceType;
    status: CredentialStatus;
    lastTestedAt: string | null;
    testError: string | null;
    fields: Record<string, string>;
}
export interface CredentialTestResult {
    service: string;
    success: boolean;
    message: string;
    error: string | null;
}
/** 전체 서비스 자격증명 상태 조회 */
export declare function fetchCredentialStatuses(): Promise<{
    services: ServiceStatusInfo[];
}>;
/** 자격증명 저장 */
export declare function saveServiceCredentials(service: ServiceType, credentials: Record<string, string>): Promise<{
    success: boolean;
}>;
/** 자격증명 삭제 */
export declare function deleteServiceCredentials(service: ServiceType): Promise<{
    success: boolean;
}>;
/** 연결 테스트 */
export declare function testServiceConnection(service: ServiceType): Promise<CredentialTestResult>;
//# sourceMappingURL=api.d.ts.map