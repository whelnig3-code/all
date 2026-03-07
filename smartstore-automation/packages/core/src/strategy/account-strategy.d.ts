export interface AccountStrategy {
    /** 최소 허용 스코어 (calculateProductScore 결과 기준) */
    minScore: number;
    /** 최소 허용 마진율 (0~1) */
    minMarginRate: number;
    /** 최대 허용 경쟁사 수 */
    maxCompetitors: number;
}
/**
 * 계정 ID에 맞는 등록 전략 반환
 * 맵에 없는 accountId는 DEFAULT_STRATEGY 적용
 */
export declare function getAccountStrategy(accountId: string): AccountStrategy;
//# sourceMappingURL=account-strategy.d.ts.map