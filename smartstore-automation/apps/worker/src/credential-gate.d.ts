import { type ServiceType } from '@smartstore/core';
export interface GateResult {
    passed: boolean;
    missing: ServiceType[];
}
/**
 * 필수 서비스 자격증명이 모두 설정되었는지 확인
 *
 * @param required 필수 서비스 목록
 * @returns { passed: true } 이면 통과, false이면 missing에 미설정 서비스 목록
 */
export declare function checkCredentialGate(required: ServiceType[]): Promise<GateResult>;
/**
 * 게이트 실패 시 반환할 표준 결과 객체
 */
export declare function gateSkipResult(missing: ServiceType[]): {
    skipped: boolean;
    reason: string;
    missingServices: ServiceType[];
};
//# sourceMappingURL=credential-gate.d.ts.map