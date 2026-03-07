import type { ServiceType } from '@smartstore/core';
export interface TestResult {
    success: boolean;
    message: string;
    error?: string;
}
/**
 * 서비스별 연결 테스트 디스패처
 */
export declare function testServiceConnection(service: ServiceType, creds: Record<string, string>): Promise<TestResult>;
//# sourceMappingURL=credential-tester.d.ts.map