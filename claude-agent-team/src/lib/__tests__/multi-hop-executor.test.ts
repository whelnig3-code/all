/**
 * multi-hop-executor.ts 단위 테스트 (TDD — RED phase)
 *
 * Shadow multi-hop을 실제 실행으로 전환하는 순수 함수 모듈.
 * 마치 릴레이 경기처럼, 각 주자(에이전트)가 바톤(context)을 다음 주자에게 넘기며
 * 예산(budget) 내에서 체인을 완주하는 구조.
 *
 * 테스트 대상:
 * - createDefaultBudget: 기본값 및 부분 오버라이드
 * - detectLoop: 루프 감지
 * - validateBudget: 예산 검증
 * - executeMultiHop: 멀티홉 체인 실행
 */
import { describe, it, expect, vi } from "vitest";
import {
  createDefaultBudget,
  detectLoop,
  validateBudget,
  executeMultiHop,
  type HopBudget,
  type HopResult,
  type MultiHopChainResult,
  type HopExecuteFn,
} from "../multi-hop-executor";

// ─── createDefaultBudget ─────────────────────────────────────────────────────

describe("createDefaultBudget", () => {
  it("returns default values when no overrides provided", () => {
    const budget = createDefaultBudget();

    expect(budget.maxHops).toBe(5);
    expect(budget.maxTotalTokens).toBe(50000);
    expect(budget.maxTotalCostUsd).toBe(1.0);
  });

  it("applies partial overrides while keeping defaults for unspecified fields", () => {
    const budget = createDefaultBudget({ maxHops: 3 });

    expect(budget.maxHops).toBe(3);
    expect(budget.maxTotalTokens).toBe(50000);
    expect(budget.maxTotalCostUsd).toBe(1.0);
  });

  it("applies all overrides when fully specified", () => {
    const budget = createDefaultBudget({
      maxHops: 10,
      maxTotalTokens: 100000,
      maxTotalCostUsd: 5.0,
    });

    expect(budget.maxHops).toBe(10);
    expect(budget.maxTotalTokens).toBe(100000);
    expect(budget.maxTotalCostUsd).toBe(5.0);
  });
});

// ─── detectLoop ──────────────────────────────────────────────────────────────

describe("detectLoop", () => {
  it("returns false when visited is empty", () => {
    expect(detectLoop("developer", [])).toBe(false);
  });

  it("returns false when agentId is not in visited", () => {
    expect(detectLoop("reviewer", ["developer", "planner"])).toBe(false);
  });

  it("returns true when agentId is in visited (loop detected)", () => {
    expect(detectLoop("developer", ["developer", "reviewer"])).toBe(true);
  });
});

// ─── validateBudget ──────────────────────────────────────────────────────────

describe("validateBudget", () => {
  const defaultBudget: HopBudget = {
    maxHops: 5,
    maxTotalTokens: 50000,
    maxTotalCostUsd: 1.0,
  };

  it("returns allowed=true when within budget", () => {
    const result = validateBudget(10000, 0.2, defaultBudget);

    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("returns allowed=false when tokens exceeded", () => {
    const result = validateBudget(60000, 0.2, defaultBudget);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("token");
  });

  it("returns allowed=false when cost exceeded", () => {
    const result = validateBudget(10000, 1.5, defaultBudget);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("cost");
  });

  it("returns allowed=true at exact boundary (tokens)", () => {
    const result = validateBudget(50000, 0.5, defaultBudget);

    expect(result.allowed).toBe(true);
  });

  it("returns allowed=true at exact boundary (cost)", () => {
    const result = validateBudget(10000, 1.0, defaultBudget);

    expect(result.allowed).toBe(true);
  });
});

// ─── executeMultiHop ─────────────────────────────────────────────────────────

describe("executeMultiHop", () => {
  // Helper: create a mock executeFn that returns predictable results
  function createMockExecuteFn(
    tokenCounts?: Record<string, number>,
    failures?: Set<string>,
  ): HopExecuteFn {
    return vi.fn().mockImplementation(async (agentId: string) => {
      if (failures?.has(agentId)) {
        throw new Error(`Agent ${agentId} failed`);
      }
      const tokens = tokenCounts?.[agentId] ?? 1000;
      return { tokens, response: `Response from ${agentId}` };
    });
  }

  it("returns immediately for empty candidates", async () => {
    const executeFn = createMockExecuteFn();
    const result = await executeMultiHop([], "initial context", executeFn);

    expect(result.hops).toHaveLength(0);
    expect(result.totalTokens).toBe(0);
    expect(result.totalCostUsd).toBe(0);
    expect(result.status).toBe("completed");
    expect(result.budgetUsedPercent).toBe(0);
    expect(executeFn).not.toHaveBeenCalled();
  });

  it("executes single hop successfully", async () => {
    const executeFn = createMockExecuteFn({ developer: 2000 });
    const result = await executeMultiHop(
      ["developer"],
      "initial context",
      executeFn,
    );

    expect(result.hops).toHaveLength(1);
    expect(result.hops[0].agentId).toBe("developer");
    expect(result.hops[0].hopIndex).toBe(0);
    expect(result.hops[0].tokens).toBe(2000);
    expect(result.hops[0].status).toBe("completed");
    expect(result.status).toBe("completed");
    expect(result.totalTokens).toBe(2000);
  });

  it("chains context through multiple hops", async () => {
    const executeFn = vi.fn().mockImplementation(async (agentId: string, context: string) => {
      return { tokens: 1000, response: `${agentId} processed: ${context}` };
    });

    const result = await executeMultiHop(
      ["planner", "developer", "reviewer"],
      "initial task",
      executeFn,
    );

    expect(result.hops).toHaveLength(3);
    expect(result.status).toBe("completed");

    // Verify context chaining: each hop receives previous hop's response
    expect(executeFn).toHaveBeenCalledTimes(3);
    // First call with initial context
    expect(executeFn).toHaveBeenNthCalledWith(1, "planner", "initial task");
    // Second call with first hop's response
    expect(executeFn).toHaveBeenNthCalledWith(
      2,
      "developer",
      "planner processed: initial task",
    );
    // Third call with second hop's response
    expect(executeFn).toHaveBeenNthCalledWith(
      3,
      "reviewer",
      "developer processed: planner processed: initial task",
    );
  });

  it("stops early when budget exceeded mid-chain", async () => {
    const executeFn = createMockExecuteFn({
      planner: 30000,
      developer: 25000,  // This would push total over 50000
      reviewer: 1000,
    });

    const result = await executeMultiHop(
      ["planner", "developer", "reviewer"],
      "initial context",
      executeFn,
    );

    // planner (30000) + developer (25000) = 55000 > 50000
    // So after planner completes, developer's budget check should fail
    expect(result.hops.length).toBeLessThanOrEqual(2);
    expect(result.status).toBe("budget_exceeded");

    // Verify reviewer was never called
    const calledAgents = (executeFn as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0],
    );
    expect(calledAgents).not.toContain("reviewer");
  });

  it("stops early when loop detected", async () => {
    const executeFn = createMockExecuteFn();

    const result = await executeMultiHop(
      ["developer", "reviewer", "developer"],
      "initial context",
      executeFn,
    );

    // developer appears twice — loop detected at index 2
    expect(result.hops).toHaveLength(3);
    expect(result.hops[2].status).toBe("loop_detected");
    expect(result.status).toBe("loop_detected");
  });

  it("records error when hop execution fails", async () => {
    const executeFn = createMockExecuteFn(
      { planner: 1000 },
      new Set(["developer"]),
    );

    const result = await executeMultiHop(
      ["planner", "developer", "reviewer"],
      "initial context",
      executeFn,
    );

    // planner succeeds, developer fails
    expect(result.hops.length).toBeGreaterThanOrEqual(2);
    const failedHop = result.hops.find((h) => h.agentId === "developer");
    expect(failedHop).toBeDefined();
    expect(failedHop!.status).toBe("failed");
    expect(failedHop!.error).toContain("Agent developer failed");
    expect(result.status).toBe("partial");
  });

  it("calculates budget percentage correctly", async () => {
    const executeFn = createMockExecuteFn({
      developer: 25000, // 50% of default 50000 token budget
    });

    const result = await executeMultiHop(
      ["developer"],
      "initial context",
      executeFn,
    );

    // 25000 tokens out of 50000 = 50% token usage
    // Cost: 25000 * 15 / 1_000_000 = 0.375 → 0.375 / 1.0 = 37.5% cost usage
    // budgetUsedPercent = max(token%, cost%) = 50%
    expect(result.budgetUsedPercent).toBe(50);
  });

  it("generates chain ID with correct format", async () => {
    const executeFn = createMockExecuteFn();
    const result = await executeMultiHop(
      ["developer"],
      "initial context",
      executeFn,
    );

    expect(result.chainId).toMatch(/^chain-\d+-[a-z0-9]+$/);
  });

  it("respects maxHops budget override", async () => {
    const executeFn = createMockExecuteFn();

    const result = await executeMultiHop(
      ["planner", "developer", "reviewer"],
      "initial context",
      executeFn,
      { maxHops: 2 },
    );

    // Only 2 hops should execute; 3rd should be budget_exceeded
    expect(result.hops.length).toBeLessThanOrEqual(3);
    // The chain should stop because maxHops = 2
    const completedHops = result.hops.filter((h) => h.status === "completed");
    expect(completedHops.length).toBeLessThanOrEqual(2);
    expect(result.status).toBe("budget_exceeded");
  });

  it("accumulates totalDurationMs across hops", async () => {
    const executeFn = vi.fn().mockImplementation(async (agentId: string) => {
      // Simulate some delay
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { tokens: 100, response: `done-${agentId}` };
    });

    const result = await executeMultiHop(
      ["developer", "reviewer"],
      "start",
      executeFn,
    );

    expect(result.totalDurationMs).toBeGreaterThan(0);
    // totalDurationMs should roughly equal sum of hop durations
    const hopDurationSum = result.hops.reduce((s, h) => s + h.durationMs, 0);
    expect(result.totalDurationMs).toBe(hopDurationSum);
  });

  it("calculates cost using COST_PER_MILLION_TOKENS = 15", async () => {
    const executeFn = createMockExecuteFn({ developer: 1_000_000 });

    const result = await executeMultiHop(
      ["developer"],
      "initial context",
      executeFn,
      { maxTotalTokens: 2_000_000, maxTotalCostUsd: 100 },
    );

    // 1,000,000 tokens * $15 / 1,000,000 = $15.00
    expect(result.totalCostUsd).toBe(15);
    expect(result.hops[0].costUsd).toBe(15);
  });
});
