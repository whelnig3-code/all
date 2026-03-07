/**
 * ADMIN_PASS 보안 검증
 *
 * 다음 조건에서 Error throw:
 *   - ADMIN_PASS가 미설정 (undefined / 빈 문자열)
 *   - ADMIN_PASS가 기본값 "changeme"
 *
 * @throws Error  보안 기준 미충족 시
 */
export declare function validateAdminPassword(): void;
//# sourceMappingURL=env-guard.d.ts.map