export type SupportedCurrency = 'USD' | 'CNY';
/**
 * 지정 통화의 원화(KRW) 환율 반환
 *
 * @param currency 'USD' | 'CNY'
 * @returns 1외화 당 원화 (예: USD → 1300.5)
 *
 * 비활성화 모드: 폴백 환율 반환 (API 호출 없음)
 * 활성화 모드:   캐시 유효 시 캐시값, 만료 시 API 재조회
 */
export declare function fetchExchangeRate(currency: SupportedCurrency): Promise<number>;
/**
 * 테스트/개발 용도: 캐시 초기화
 */
export declare function clearRateCache(): void;
//# sourceMappingURL=index.d.ts.map