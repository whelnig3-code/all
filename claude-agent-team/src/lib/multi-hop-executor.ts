/**
 * multi-hop-executor.ts — Multi-Hop Chain Execution Engine (Pure Functions)
 *
 * Shadow multi-hop을 실제 실행으로 전환하는 순수 함수 모듈.
 * 마치 릴레이 경기처럼, 각 주자(에이전트)가 바톤(context)을 다음 주자에게 넘기며
 * 예산(budget) 내에서 체인을 완주하는 구조.
 *
 * 핵심 설계 결정:
 * - 순수 함수만 사용 (side-effect 없음, 파일 I/O 없음)
 * - 모든 인터페이스 readonly (불변성 보장)
 * - HopExecuteFn 주입으로 테스트 용이성 확보
 * - 예산 초과, 루프 감지 시 조기 종료
 * - COST_PER_MILLION_TOKENS = 15 (agent-telemetry.ts와 동일)
 */

// ─── Constants ──────────────────────────────────────────────────────────────

/** Sonnet output 기준 $15/1M tokens (agent-telemetry.ts와 동일) */
const COST_PER_MILLION_TOKENS = 15;

const DEFAULT_MAX_HOPS = 5;
const DEFAULT_MAX_TOTAL_TOKENS = 50000;
const DEFAULT_MAX_TOTAL_COST_USD = 1.0;

// ─── Types ──────────────────────────────────────────────────────────────────

/** Budget enforcement — 체인 실행 허용 한도 */
export interface HopBudget {
  readonly maxHops: number;
  readonly maxTotalTokens: number;
  readonly maxTotalCostUsd: number;
}

/** Single hop result — 개별 홉 실행 결과 */
export interface HopResult {
  readonly agentId: string;
  readonly hopIndex: number;
  readonly tokens: number;
  readonly costUsd: number;
  readonly durationMs: number;
  readonly status: "completed" | "failed" | "budget_exceeded" | "loop_detected";
  readonly error?: string;
}

/** Full chain result — 전체 체인 실행 결과 */
export interface MultiHopChainResult {
  readonly chainId: string;
  readonly hops: readonly HopResult[];
  readonly totalTokens: number;
  readonly totalCostUsd: number;
  readonly totalDurationMs: number;
  readonly status: "completed" | "partial" | "budget_exceeded" | "loop_detected";
  readonly budgetUsedPercent: number;
}

/** Hop executor function type (injected for testability) */
export type HopExecuteFn = (
  agentId: string,
  context: string,
) => Promise<{
  readonly tokens: number;
  readonly response: string;
}>;

// ─── Pure Functions ─────────────────────────────────────────────────────────

/**
 * 기본 예산을 생성합니다.
 * 마치 여행 출발 전 예산표를 작성하는 것과 같다.
 * 지정하지 않은 항목은 기본값으로 채워진다.
 *
 * @param overrides - 기본값을 덮어쓸 부분 예산 설정
 * @returns 완전한 HopBudget 객체
 */
export function createDefaultBudget(overrides?: Partial<HopBudget>): HopBudget {
  return {
    maxHops: overrides?.maxHops ?? DEFAULT_MAX_HOPS,
    maxTotalTokens: overrides?.maxTotalTokens ?? DEFAULT_MAX_TOTAL_TOKENS,
    maxTotalCostUsd: overrides?.maxTotalCostUsd ?? DEFAULT_MAX_TOTAL_COST_USD,
  };
}

/**
 * 루프 감지 — 이미 방문한 에이전트를 다시 방문하려 하는지 검사합니다.
 * 마치 미로에서 이미 지나온 길에 표시를 해두고, 같은 곳에 다시 오면 멈추는 것과 같다.
 *
 * @param agentId - 다음에 실행할 에이전트 ID
 * @param visited - 이미 방문한 에이전트 목록
 * @returns true이면 루프 감지됨
 */
export function detectLoop(
  agentId: string,
  visited: readonly string[],
): boolean {
  return visited.includes(agentId);
}

/**
 * 예산 유효성 검증 — 현재 누적 토큰/비용이 예산 내인지 확인합니다.
 * 마치 가계부를 확인하며 "아직 남은 예산이 있는가?"를 점검하는 것과 같다.
 *
 * @param currentTokens - 현재까지 누적된 토큰 수
 * @param currentCost - 현재까지 누적된 비용 (USD)
 * @param budget - 예산 한도
 * @returns allowed=true이면 계속 진행 가능, false이면 사유와 함께 차단
 */
export function validateBudget(
  currentTokens: number,
  currentCost: number,
  budget: HopBudget,
): { readonly allowed: boolean; readonly reason?: string } {
  if (currentTokens > budget.maxTotalTokens) {
    return {
      allowed: false,
      reason: `token budget exceeded: ${currentTokens} > ${budget.maxTotalTokens}`,
    };
  }

  if (currentCost > budget.maxTotalCostUsd) {
    return {
      allowed: false,
      reason: `cost budget exceeded: $${currentCost} > $${budget.maxTotalCostUsd}`,
    };
  }

  return { allowed: true };
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/** 토큰 수로부터 비용(USD)을 계산합니다. */
function calculateCost(tokens: number): number {
  return (tokens / 1_000_000) * COST_PER_MILLION_TOKENS;
}

/** chain-{timestamp}-{random} 형식의 고유 체인 ID를 생성합니다. */
function generateChainId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 10);
  return `chain-${timestamp}-${random}`;
}

/** 예산 사용 퍼센트를 계산합니다 (토큰%와 비용% 중 큰 값). */
function calculateBudgetUsedPercent(
  totalTokens: number,
  totalCostUsd: number,
  budget: HopBudget,
): number {
  const tokenPercent = budget.maxTotalTokens > 0
    ? (totalTokens / budget.maxTotalTokens) * 100
    : 0;
  const costPercent = budget.maxTotalCostUsd > 0
    ? (totalCostUsd / budget.maxTotalCostUsd) * 100
    : 0;
  return Math.round(Math.max(tokenPercent, costPercent));
}

// ─── Main Execution Function ────────────────────────────────────────────────

/**
 * 멀티홉 체인을 실행합니다.
 * 마치 릴레이 경기에서 각 주자가 순서대로 바톤을 넘기는 것과 같다.
 * 각 홉(주자)은 이전 홉의 응답(바톤)을 받아 실행하며,
 * 예산 초과/루프 감지/실패 시 즉시 경기를 중단합니다.
 *
 * @param candidates - 실행할 에이전트 ID 목록 (순서대로 실행)
 * @param initialContext - 첫 번째 홉에 전달할 초기 컨텍스트
 * @param executeFn - 개별 홉 실행 함수 (DI로 주입)
 * @param budget - 예산 오버라이드 (부분 지정 가능)
 * @returns 전체 체인 실행 결과
 */
export async function executeMultiHop(
  candidates: readonly string[],
  initialContext: string,
  executeFn: HopExecuteFn,
  budget?: Partial<HopBudget>,
): Promise<MultiHopChainResult> {
  const chainId = generateChainId();
  const resolvedBudget = createDefaultBudget(budget);

  // Empty candidates — 즉시 완료 반환
  if (candidates.length === 0) {
    return {
      chainId,
      hops: [],
      totalTokens: 0,
      totalCostUsd: 0,
      totalDurationMs: 0,
      status: "completed",
      budgetUsedPercent: 0,
    };
  }

  const hops: HopResult[] = [];
  const visited: string[] = [];
  let currentContext = initialContext;
  let totalTokens = 0;
  let totalCostUsd = 0;
  let totalDurationMs = 0;
  let chainStatus: MultiHopChainResult["status"] = "completed";

  for (let i = 0; i < candidates.length; i++) {
    const agentId = candidates[i];

    // ── 홉 수 제한 검사 ──────────────────────────────────────────────────
    if (i >= resolvedBudget.maxHops) {
      hops.push({
        agentId,
        hopIndex: i,
        tokens: 0,
        costUsd: 0,
        durationMs: 0,
        status: "budget_exceeded",
        error: `maxHops (${resolvedBudget.maxHops}) exceeded`,
      });
      chainStatus = "budget_exceeded";
      break;
    }

    // ── 루프 감지 ────────────────────────────────────────────────────────
    if (detectLoop(agentId, visited)) {
      hops.push({
        agentId,
        hopIndex: i,
        tokens: 0,
        costUsd: 0,
        durationMs: 0,
        status: "loop_detected",
        error: `Loop detected: ${agentId} already visited`,
      });
      chainStatus = "loop_detected";
      break;
    }

    // ── 예산 사전 검증 ──────────────────────────────────────────────────
    const budgetCheck = validateBudget(totalTokens, totalCostUsd, resolvedBudget);
    if (!budgetCheck.allowed) {
      hops.push({
        agentId,
        hopIndex: i,
        tokens: 0,
        costUsd: 0,
        durationMs: 0,
        status: "budget_exceeded",
        error: budgetCheck.reason,
      });
      chainStatus = "budget_exceeded";
      break;
    }

    // ── 홉 실행 ─────────────────────────────────────────────────────────
    const startTime = Date.now();
    try {
      const result = await executeFn(agentId, currentContext);
      const durationMs = Date.now() - startTime;
      const hopCost = calculateCost(result.tokens);

      const hopResult: HopResult = {
        agentId,
        hopIndex: i,
        tokens: result.tokens,
        costUsd: hopCost,
        durationMs,
        status: "completed",
      };

      hops.push(hopResult);
      visited.push(agentId);
      totalTokens += result.tokens;
      totalCostUsd += hopCost;
      totalDurationMs += durationMs;

      // 다음 홉에 이전 응답을 context로 전달
      currentContext = result.response;

      // ── 실행 후 예산 검증 (다음 홉 진행 가능 여부) ─────────────────────
      const postCheck = validateBudget(totalTokens, totalCostUsd, resolvedBudget);
      if (!postCheck.allowed && i < candidates.length - 1) {
        // 다음 홉이 남아있지만 예산 초과 → 조기 종료
        chainStatus = "budget_exceeded";
        break;
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      hops.push({
        agentId,
        hopIndex: i,
        tokens: 0,
        costUsd: 0,
        durationMs,
        status: "failed",
        error: errorMessage,
      });

      totalDurationMs += durationMs;
      chainStatus = "partial";
      break;
    }
  }

  return {
    chainId,
    hops,
    totalTokens,
    totalCostUsd,
    totalDurationMs,
    status: chainStatus,
    budgetUsedPercent: calculateBudgetUsedPercent(
      totalTokens,
      totalCostUsd,
      resolvedBudget,
    ),
  };
}
