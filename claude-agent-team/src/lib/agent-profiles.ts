/**
 * agent-profiles.ts — 에이전트별 비용/성능 프로필 (단일 진실 원천)
 *
 * 비유: 에이전트 이력서. 각 에이전트가 평균적으로 얼마나 걸리고,
 * 얼마나 많은 토큰을 쓰는지 한 곳에서 관리한다.
 * 두 군데(라우터, 텔레메트리)에서 같은 정보를 따로 관리하면
 * 누군가 이력서를 업데이트할 때 한쪽만 바꾸는 실수가 생긴다.
 *
 * 용도:
 * - 라우팅 비용 시뮬레이션 (soft budget, cost estimation)
 * - 텔레메트리 대시보드 (비용/지연 추정)
 */

/** 에이전트별 실행 비용 프로필 (평균값 기준) */
export interface AgentCostProfile {
  /** 평균 실행 시간 (ms) */
  readonly avgLatencyMs: number;
  /** 평균 토큰 소비 (입출력 합산) */
  readonly avgTokenCost: number;
}

/**
 * 에이전트별 비용 프로필 — 라우팅 비용 시뮬레이션용
 *
 * 빠른 추정값: 라우팅 결정 시 "이 체인이 예산 내인가?" 판단에 사용.
 * 실측 데이터로 주기적 조정 권장.
 */
export const ROUTING_COST_PROFILES: Record<string, AgentCostProfile> = {
  planner:            { avgLatencyMs: 8000,  avgTokenCost: 2000 },
  developer:          { avgLatencyMs: 12000, avgTokenCost: 3000 },
  reviewer:           { avgLatencyMs: 6000,  avgTokenCost: 1500 },
  writer:             { avgLatencyMs: 4000,  avgTokenCost: 1000 },
  "security-auditor": { avgLatencyMs: 7000,  avgTokenCost: 2200 },
  researcher:         { avgLatencyMs: 9000,  avgTokenCost: 2500 },
  designer:           { avgLatencyMs: 5000,  avgTokenCost: 1200 },
};

/** 프로필 미등록 에이전트에 사용하는 기본값 */
export const DEFAULT_COST_PROFILE: AgentCostProfile = {
  avgLatencyMs: 6000,
  avgTokenCost: 1500,
};

/**
 * 에이전트별 평균 출력 토큰 — 텔레메트리/비용 추정용
 *
 * 실측 기반 값: 대시보드 통계 표시에 사용.
 */
export const AVG_TOKENS_PER_AGENT: Record<string, number> = {
  planner: 1800, developer: 2200, reviewer: 1600,
  writer: 1200, "security-auditor": 1400, researcher: 1500, designer: 1000,
};

/** 에이전트별 평균 지연 시간 (ms) — 텔레메트리/비용 추정용 */
export const AVG_LATENCY_PER_AGENT: Record<string, number> = {
  planner: 20000, developer: 32000, reviewer: 22000,
  writer: 15000, "security-auditor": 18000, researcher: 20000, designer: 12000,
};
