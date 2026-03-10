// =============================================
// 계정별 등록 전략
// accountId마다 스코어 기준, 마진율, 경쟁사 수 상한을 다르게 적용
// =============================================

export interface AccountStrategy {
  /** 최소 허용 스코어 (calculateProductScore 결과 기준) */
  minScore: number
  /** 최소 허용 마진율 (0~1) */
  minMarginRate: number
  /** 최대 허용 경쟁사 수 */
  maxCompetitors: number
}

/** 계정별 전략 맵 (하드코딩, 1차) */
const ACCOUNT_STRATEGIES: Record<string, AccountStrategy> = {
  // 패션 전문 — 고마진·저경쟁 엄격 기준
  account1: { minScore: 80, minMarginRate: 0.35, maxCompetitors: 40 },

  // 생활/식품 전문 — 중간 기준
  account2: { minScore: 75, minMarginRate: 0.25, maxCompetitors: 80 },

  // IT·전자 전문 — 경쟁이 많은 카테고리 특성상 완화
  account3: { minScore: 70, minMarginRate: 0.20, maxCompetitors: 120 },

  // 레저·취미 전문 — account1보다 완화
  account4: { minScore: 78, minMarginRate: 0.30, maxCompetitors: 60 },
}

/** 미등록 계정 fallback 기준 */
const DEFAULT_STRATEGY: AccountStrategy = {
  minScore: 75,
  minMarginRate: 0.25,
  maxCompetitors: 80,
}

/**
 * 계정 ID에 맞는 등록 전략 반환
 * 맵에 없는 accountId는 DEFAULT_STRATEGY 적용
 */
export function getAccountStrategy(accountId: string): AccountStrategy {
  return ACCOUNT_STRATEGIES[accountId] ?? DEFAULT_STRATEGY
}
