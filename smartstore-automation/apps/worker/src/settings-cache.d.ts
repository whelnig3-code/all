/**
 * 캐시에서 설정값 반환
 * 캐시에 키가 없으면 기본값 "true" 반환 (자동화 활성 유지)
 *
 * @param key 설정 키 (예: 'AUTO_PRICE_ENABLED')
 * @returns 설정값 문자열 (없으면 "true")
 */
export declare function getSetting(key: string): string;
/**
 * 주기적 DB 갱신 시작 (워커 시작 시 1회 호출)
 * 즉시 1회 로드 후 intervalMs마다 반복 갱신
 * 이미 실행 중이면 중복 시작 방지
 *
 * @param intervalMs 갱신 주기 ms (기본 60초)
 */
export declare function startSettingsRefresh(intervalMs?: number): void;
/**
 * 주기적 갱신 중단 (프로세스 종료 또는 테스트 cleanup 시 호출)
 */
export declare function stopSettingsRefresh(): void;
/**
 * DB에서 즉시 강제 갱신 (설정 변경 후 즉시 반영 시 사용)
 */
export declare function forceRefresh(): Promise<void>;
/** @internal 테스트 전용 — 캐시 직접 세팅 (실운영에서 호출 금지) */
export declare function _setSettingForTest(key: string, value: string): void;
/** @internal 테스트 전용 — 캐시 전체 초기화 (실운영에서 호출 금지) */
export declare function _resetCacheForTest(): void;
//# sourceMappingURL=settings-cache.d.ts.map