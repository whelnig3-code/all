/**
 * agent-telemetry.ts — Statistics, telemetry, and performance tracking
 *
 * Manages API call counts, token estimation, agent call distribution,
 * chain hop tracking, cost estimation, and timeout/max-token configuration.
 *
 * Extracted from agent-manager.ts for single-responsibility.
 * All exports are re-exported from agent-manager.ts for backward compatibility.
 */
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("agent-telemetry");

// ── 체인 텔레메트리 누산기 (서버 프로세스 라이프타임 동안 누적) ──────────────
// agentCallDistribution: 에이전트별 누적 호출 횟수 (WORKER_DONE 기준)
const agentCallDistribution: Record<string, number> = {};
// _chainHopCountMap: 체인 루트 taskId → 완료된 hop 수
// (체인이 완전히 끝나면 CHAIN_SUMMARY에서 읽고 Map에서 삭제)
const _chainHopCountMap = new Map<string, number>();

// API 사용량 추적 (인메모리)
let apiCallCount = 0;
let estimatedTokens = 0;

// ── 에이전트별 토큰/비용 추적 (인메모리) ─────────────────────────────────────
// Sonnet output 기준 $15/1M tokens (추정 비용 계산용)
const COST_PER_MILLION_TOKENS = 15;

interface AgentTokenStats {
  readonly callCount: number;
  readonly totalTokens: number;
  readonly estimatedCost: number;
}

// 에이전트별 누적 통계 (서버 프로세스 라이프타임 동안 유지)
const agentTokenStats: Record<string, AgentTokenStats> = {};

// ── API 사용량 통계 ──────────────────────────────────────────────────────────
export function getApiStats() {
  return { apiCallCount, estimatedTokens };
}

// ── API 호출 카운트 증가 + 토큰 누산 ─────────────────────────────────────────
export function incrementApiCall(messageLen: number, responseLen: number, agentId?: string): void {
  apiCallCount++;
  const tokens = Math.round((messageLen + responseLen) / 4);
  estimatedTokens += tokens;

  // 에이전트별 토큰/비용 누산 (agentId가 제공된 경우)
  if (agentId) {
    const prev = agentTokenStats[agentId] ?? { callCount: 0, totalTokens: 0, estimatedCost: 0 };
    const cost = (tokens / 1_000_000) * COST_PER_MILLION_TOKENS;
    agentTokenStats[agentId] = {
      callCount: prev.callCount + 1,
      totalTokens: prev.totalTokens + tokens,
      estimatedCost: Math.round((prev.estimatedCost + cost) * 1_000_000) / 1_000_000,
    };
  }
}

/** 현재 누적 추정 토큰 수 반환 (cost-aware 차단 등에서 사용) */
export function getEstimatedTokens(): number {
  return estimatedTokens;
}

// ── 에이전트별 토큰 통계 반환 ────────────────────────────────────────────────

export interface TokenDashboardStats {
  readonly agents: Record<string, AgentTokenStats>;
  readonly totals: {
    readonly callCount: number;
    readonly totalTokens: number;
    readonly estimatedCost: number;
  };
}

/** 에이전트별 + 전체 토큰/비용 통계 반환 (읽기 전용 복사본) */
export function getTokenDashboardStats(): TokenDashboardStats {
  // 에이전트별 복사본 생성 (불변성)
  const agentsCopy: Record<string, AgentTokenStats> = {};
  let totalCalls = 0;
  let totalTokens = 0;
  let totalCost = 0;

  for (const [id, stats] of Object.entries(agentTokenStats)) {
    agentsCopy[id] = { ...stats };
    totalCalls += stats.callCount;
    totalTokens += stats.totalTokens;
    totalCost += stats.estimatedCost;
  }

  return {
    agents: agentsCopy,
    totals: {
      callCount: totalCalls,
      totalTokens,
      estimatedCost: Math.round(totalCost * 1_000_000) / 1_000_000,
    },
  };
}

// ── 에이전트 호출 분포 추적 ──────────────────────────────────────────────────
export function recordAgentCall(agentId: string): void {
  agentCallDistribution[agentId] = (agentCallDistribution[agentId] ?? 0) + 1;
  log.info({ distribution: agentCallDistribution }, "AGENT_CALL_DISTRIBUTION");
}

/** 에이전트 호출 분포 반환 (읽기 전용 복사본) */
export function getAgentCallDistribution(): Record<string, number> {
  return { ...agentCallDistribution };
}

// ── 체인 hop 카운트 추적 ─────────────────────────────────────────────────────
export function incrementChainHopCount(chainRootTaskId: string): void {
  _chainHopCountMap.set(
    chainRootTaskId,
    (_chainHopCountMap.get(chainRootTaskId) ?? 0) + 1
  );
}

export function getChainHopCount(chainRootTaskId: string): number {
  return _chainHopCountMap.get(chainRootTaskId) ?? 0;
}

export function deleteChainHopCount(chainRootTaskId: string): void {
  _chainHopCountMap.delete(chainRootTaskId);
}

// ── 모델별 타임아웃 결정 함수 ────────────────────────────────────────────────
// - claude-opus-*  : 복잡한 기획/설계 작업, 20분(1,200,000ms)
// - claude-sonnet-*: 기획·개발·리뷰 등 실질 작업 기준 15분(900,000ms)
//   → Phase 2 개발처럼 파일 수십 개 작성 시 6분 초과 사례 있어 상향
// - haiku / 기타   : 가벼운 문서 작업, 기본 10분(600,000ms)
// 단축 모델명("opus", "sonnet", "haiku")도 함께 처리합니다.
function getModelTimeout(model: string | undefined): number {
  const m = (model ?? "").toLowerCase();

  // Opus 계열: 풀 모델명(claude-opus-*) 또는 단축명("opus")
  if (m.includes("opus")) return 1_200_000; // 20분

  // Sonnet 계열: 풀 모델명(claude-sonnet-*) 또는 단축명("sonnet")
  // Phase 2 개발처럼 파일 다수 작성 시 6분 이상 소요 가능
  if (m.includes("sonnet")) return 900_000; // 15분

  // Haiku / 기타 모델: 기본값
  return 600_000; // 10분
}

// ── Step 1: 에이전트별 Hard Timeout 결정 ─────────────────────────────────────
// ENV: AGENT_TIMEOUT_DEVELOPER_MS / AGENT_TIMEOUT_REVIEWER_MS / AGENT_TIMEOUT_SECURITY_MS
//      / AGENT_TIMEOUT_DEFAULT_MS
// ⚠️ ENV 미설정 시: getModelTimeout(model)로 폴백 (기존 15분/20분 유지)
//    단기 타임아웃은 ENV를 명시해야만 적용됨 (planner 등 장시간 작업 보호)
export function getAgentTimeout(agentId: string, model?: string): number {
  const envMap: Record<string, string | undefined> = {
    developer:          process.env.AGENT_TIMEOUT_DEVELOPER_MS,
    reviewer:           process.env.AGENT_TIMEOUT_REVIEWER_MS,
    "security-auditor": process.env.AGENT_TIMEOUT_SECURITY_MS,
  };
  const raw = envMap[agentId] ?? process.env.AGENT_TIMEOUT_DEFAULT_MS;
  if (raw) {
    const ms = Number(raw);
    if (!isNaN(ms) && ms > 0) return ms;
  }
  // ENV 미설정 시: 모델 기반 타임아웃 사용 (기존 동작 유지)
  // → sonnet=15분, opus=20분, haiku=10분
  return getModelTimeout(model);
}

// ── Step 3: 에이전트별 max_tokens 상한 결정 ───────────────────────────────────
// ENV: MAX_TOKENS_DEVELOPER / MAX_TOKENS_REVIEWER / MAX_TOKENS_SECURITY / MAX_TOKENS_DEFAULT
// LLM 출력 토큰 수를 제한하여 과도한 응답 생성을 억제 (비용/지연 최적화)
export function getAgentMaxTokens(agentId: string): number {
  const envMap: Record<string, string | undefined> = {
    developer:          process.env.MAX_TOKENS_DEVELOPER,
    reviewer:           process.env.MAX_TOKENS_REVIEWER,
    "security-auditor": process.env.MAX_TOKENS_SECURITY,
  };
  const raw = envMap[agentId] ?? process.env.MAX_TOKENS_DEFAULT;
  if (raw) {
    const n = Number(raw);
    if (!isNaN(n) && n > 0) return n;
  }
  // ENV 미설정 기본값: developer=1200, reviewer=800, security=500, else=800
  const defaults: Record<string, number> = {
    developer: 1200, reviewer: 800, "security-auditor": 500,
  };
  return defaults[agentId] ?? 800;
}

// ── Cost Estimation 상수 → agent-profiles.ts 로 통합됨 ──────────────────────
export {
  AVG_TOKENS_PER_AGENT,
  AVG_LATENCY_PER_AGENT,
} from "./agent-profiles";
