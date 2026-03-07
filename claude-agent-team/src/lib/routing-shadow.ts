/**
 * routing-shadow.ts — Shadow Multi-Hop, Scoring, Cost Simulation
 *
 * 비유: 내비게이션의 "대안 경로" 기능. 현재 경로(선택된 에이전트) 외에
 * 다음에 갈 수 있는 경유지(후보 에이전트)를 점수 기반으로 미리 계산합니다.
 *
 * ⚠️ 순수 함수 모듈: 실제 에이전트 호출 없음, 상태 변경 없음
 */

import type {
  RoutingContext,
  RoutingResult,
  CandidateScore,
  DepthStrategy,
  SimulationResult,
} from "./routing-types";
import {
  ROUTING_COST_PROFILES,
  DEFAULT_COST_PROFILE,
} from "./agent-profiles";

// ─── 디버그 유틸리티 ──────────────────────────────────────────────────────────

function debugShadowLog(current: string, candidates: string[], hopCount: number): void {
  if (process.env.ENABLE_ROUTING_DEBUG !== "true") return;
  console.log("[SHADOW]", { current, candidates, hopCount });
}

function debugScoringLog(scored: CandidateScore[], hopCount: number): void {
  if (process.env.ENABLE_ROUTING_DEBUG !== "true") return;
  console.log("[SCORING]", {
    hopCount,
    ranked: scored.map((s) => ({
      agent: s.agent,
      score: s.score,
      reasons: s.reasons,
    })),
  });
}

function debugCostLog(sim: SimulationResult, hopCount: number): void {
  if (process.env.ENABLE_ROUTING_DEBUG !== "true") return;
  console.log("[COST]", {
    hopCount,
    totalLatencyMs: sim.totalLatencyMs,
    totalTokens: sim.totalTokens,
    budgetExceeded: sim.budgetExceeded,
    ...(sim.reason ? { reason: sim.reason } : {}),
  });
}

// ─── Next Candidates 계산 ──────────────────────────────────────────────────

/**
 * Shadow 전용: 다음 홉 후보 에이전트를 계산합니다.
 *
 * ⚠️ 읽기 전용 순수 계산: hopCount, visited, context 변경 금지
 *
 * @param currentAgent 방금 선택된 에이전트
 * @param lower        소문자 변환된 메시지 원문
 * @param context      현재 라우팅 컨텍스트 (visited 참조용)
 * @returns 다음 홉 후보 목록 (visited 중복 제거 후)
 */
function computeNextCandidates(
  currentAgent: string,
  lower: string,
  context: RoutingContext
): string[] {
  const candidates: string[] = [];

  if (currentAgent === "developer") {
    if (lower.includes("보안") || lower.includes("취약") || lower.includes("security")) {
      candidates.push("security-auditor");
    }
    if (lower.includes("리뷰") || lower.includes("검토") || lower.includes("review")) {
      candidates.push("reviewer");
    }
  }

  if (currentAgent === "reviewer") {
    if (lower.includes("취약점") || lower.includes("보안") || lower.includes("owasp")) {
      candidates.push("security-auditor");
    }
  }

  if (currentAgent === "planner") {
    if (
      lower.includes("구현") ||
      lower.includes("개발") ||
      lower.includes("만들어") ||
      lower.includes("코딩")
    ) {
      candidates.push("developer");
    }
  }

  return candidates.filter((a) => !context.visited.includes(a));
}

// ─── Shadow Scoring ──────────────────────────────────────────────────────────

/**
 * Shadow Scoring: 후보 에이전트 목록에 점수를 부여합니다.
 *
 * ⚠️ 순수 계산 함수: hopCount, visited, context 변경 금지
 */
function scoreCandidates(
  candidates: string[],
  lower: string,
  context: RoutingContext
): CandidateScore[] {
  return candidates.map((agent) => {
    let score = 0;
    const reasons: string[] = [];

    if (agent === "security-auditor") {
      if (lower.includes("보안") || lower.includes("취약") || lower.includes("security")) {
        score += 5;
        reasons.push("security keyword match");
      }
    }

    if (agent === "reviewer") {
      if (lower.includes("리뷰") || lower.includes("검토") || lower.includes("review")) {
        score += 4;
        reasons.push("review keyword match");
      }
    }

    if (context.hopCount > 0) {
      const strategy = (process.env.DEPTH_STRATEGY || "hard-cap") as DepthStrategy;
      let depthPenalty = 0;
      if (strategy === "soft-cap") {
        depthPenalty = context.hopCount * 2;
      } else if (strategy === "decay") {
        depthPenalty = Math.pow(2, context.hopCount);
      }
      if (depthPenalty > 0) {
        score -= depthPenalty;
        reasons.push(`depth penalty -${depthPenalty} (${strategy})`);
      }
    }

    return { agent, score, reasons };
  });
}

// ─── Cost Simulation ─────────────────────────────────────────────────────────

/**
 * 에이전트 체인의 총 실행 비용을 시뮬레이션합니다.
 *
 * ⚠️ 순수 계산 함수: 실제 에이전트 호출 없음
 */
function simulateExecutionCost(chain: string[]): SimulationResult {
  const maxLatencyMs = parseInt(process.env.MAX_LATENCY_BUDGET_MS || "4000", 10);
  const maxTokens = parseInt(process.env.MAX_TOKEN_BUDGET || "5000", 10);

  let totalLatencyMs = 0;
  let totalTokens = 0;

  for (const agentId of chain) {
    const profile = ROUTING_COST_PROFILES[agentId] ?? DEFAULT_COST_PROFILE;
    totalLatencyMs += profile.avgLatencyMs;
    totalTokens += profile.avgTokenCost;
  }

  const latencyExceeded = totalLatencyMs > maxLatencyMs;
  const tokenExceeded = totalTokens > maxTokens;
  const budgetExceeded = latencyExceeded || tokenExceeded;

  const reasons: string[] = [];
  if (latencyExceeded) reasons.push(`latency ${totalLatencyMs}ms > ${maxLatencyMs}ms`);
  if (tokenExceeded) reasons.push(`tokens ${totalTokens} > ${maxTokens}`);

  return {
    totalLatencyMs,
    totalTokens,
    budgetExceeded,
    reason: reasons.length > 0 ? reasons.join(", ") : undefined,
  };
}

// ─── Shadow 주입 헬퍼 ────────────────────────────────────────────────────────

/**
 * ENABLE_SHADOW_MULTI_HOP=true 일 때 RoutingResult에 nextCandidates를 추가합니다.
 * false 이거나 미설정이면 result를 그대로 반환합니다 (성능 영향 없음).
 *
 * ⚠️ 순수 함수: result 원본을 변경하지 않고 새 객체를 반환합니다.
 */
export function withShadow(
  result: RoutingResult,
  lower: string,
  context: RoutingContext
): RoutingResult {
  if (process.env.ENABLE_SHADOW_MULTI_HOP !== "true") return result;

  // Depth Policy: hard-cap 전략 시 홉 제한 초과 즉시 차단
  const strategy = (process.env.DEPTH_STRATEGY || "hard-cap") as DepthStrategy;
  const maxHopLimit = parseInt(process.env.MAX_HOP_LIMIT || "3", 10);
  if (strategy === "hard-cap" && result.hopCount >= maxHopLimit) {
    return { ...result, nextCandidates: [] };
  }

  const nextCandidates = computeNextCandidates(result.selectedAgent, lower, context);
  debugShadowLog(result.selectedAgent, nextCandidates, result.hopCount);

  // Cost Simulation: 예산 초과 시 nextCandidates 차단
  if (process.env.ENABLE_COST_SIMULATION === "true" && nextCandidates.length > 0) {
    const chain = [result.selectedAgent, ...nextCandidates];
    const sim = simulateExecutionCost(chain);
    debugCostLog(sim, result.hopCount);
    if (sim.budgetExceeded) {
      return { ...result, nextCandidates: [] };
    }
  }

  // Shadow Scoring: 점수 기반 내림차순 정렬
  if (process.env.ENABLE_SHADOW_SCORING === "true" && nextCandidates.length > 0) {
    const scored = scoreCandidates(nextCandidates, lower, context);
    scored.sort((a, b) => b.score - a.score);
    debugScoringLog(scored, result.hopCount);
    return { ...result, nextCandidates: scored.map((s) => s.agent) };
  }

  return { ...result, nextCandidates };
}
