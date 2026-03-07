/**
 * parallel-executor.ts 단위 테스트
 *
 * 테스트 대상: createParallelExecutor, buildExecutionPlan
 * - 독립 에이전트 병렬 실행
 * - 부분 실패 graceful 처리 (Promise.allSettled)
 * - 최대 동시 실행 제한 (세마포어 패턴)
 * - 빈 입력 / 단일 에이전트 엣지 케이스
 * - 실행 계획 빌드 (순차 그룹)
 */
import { describe, it, expect, vi } from "vitest";

// ─── createParallelExecutor ──────────────────────────────────────────────────

describe("createParallelExecutor", () => {
  it("executes independent agents in parallel", async () => {
    const { createParallelExecutor } = await import("../parallel-executor");

    const mockExecute = vi.fn().mockImplementation(async (agentId: string) => {
      // Simulate varying execution times
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { agentId, result: `Result from ${agentId}` };
    });

    const executor = createParallelExecutor(mockExecute);
    const results = await executor.executeParallel(["developer", "reviewer"]);

    expect(results).toHaveLength(2);
    expect(mockExecute).toHaveBeenCalledTimes(2);
    // Both should have been called (parallel, not sequential)
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
  });

  it("handles partial failures gracefully", async () => {
    const { createParallelExecutor } = await import("../parallel-executor");

    const mockExecute = vi.fn().mockImplementation(async (agentId: string) => {
      if (agentId === "reviewer") throw new Error("Agent failed");
      return { agentId, result: "OK" };
    });

    const executor = createParallelExecutor(mockExecute);
    const results = await executor.executeParallel(["developer", "reviewer"]);

    expect(results).toHaveLength(2);
    // developer succeeds, reviewer fails
    const devResult = results.find((r) => r.status === "fulfilled");
    const revResult = results.find((r) => r.status === "rejected");
    expect(devResult).toBeDefined();
    expect(revResult).toBeDefined();
  });

  it("respects max concurrency limit", async () => {
    const { createParallelExecutor } = await import("../parallel-executor");
    let concurrent = 0;
    let maxConcurrent = 0;

    const mockExecute = vi.fn().mockImplementation(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 20));
      concurrent--;
      return { result: "OK" };
    });

    const executor = createParallelExecutor(mockExecute, {
      maxConcurrency: 2,
    });
    await executor.executeParallel([
      "developer",
      "reviewer",
      "planner",
      "writer",
    ]);

    expect(maxConcurrent).toBeLessThanOrEqual(2);
    expect(mockExecute).toHaveBeenCalledTimes(4);
  });

  it("returns empty array for empty input", async () => {
    const { createParallelExecutor } = await import("../parallel-executor");
    const executor = createParallelExecutor(vi.fn());
    const results = await executor.executeParallel([]);
    expect(results).toEqual([]);
  });

  it("single agent execution works like normal", async () => {
    const { createParallelExecutor } = await import("../parallel-executor");
    const mockExecute = vi
      .fn()
      .mockResolvedValue({ agentId: "developer", result: "Done" });
    const executor = createParallelExecutor(mockExecute);
    const results = await executor.executeParallel(["developer"]);
    expect(results).toHaveLength(1);
    expect(mockExecute).toHaveBeenCalledWith("developer");
  });

  it("preserves agentId in fulfilled results", async () => {
    const { createParallelExecutor } = await import("../parallel-executor");

    const mockExecute = vi.fn().mockImplementation(async (agentId: string) => {
      return { agentId, data: `output-${agentId}` };
    });

    const executor = createParallelExecutor(mockExecute);
    const results = await executor.executeParallel([
      "developer",
      "reviewer",
      "planner",
    ]);

    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r.agentId).toBeDefined();
      if (r.status === "fulfilled") {
        expect(r.value).toBeDefined();
      }
    }
  });

  it("preserves agentId in rejected results", async () => {
    const { createParallelExecutor } = await import("../parallel-executor");

    const mockExecute = vi.fn().mockImplementation(async (agentId: string) => {
      throw new Error(`${agentId} crashed`);
    });

    const executor = createParallelExecutor(mockExecute);
    const results = await executor.executeParallel(["developer", "reviewer"]);

    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.status).toBe("rejected");
      expect(r.agentId).toBeDefined();
      expect(r.reason).toBeInstanceOf(Error);
    }
  });

  it("uses default maxConcurrency of 5 when not specified", async () => {
    const { createParallelExecutor } = await import("../parallel-executor");
    let concurrent = 0;
    let maxConcurrent = 0;

    const mockExecute = vi.fn().mockImplementation(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 10));
      concurrent--;
      return { result: "OK" };
    });

    const executor = createParallelExecutor(mockExecute);
    // 7 agents — default concurrency is 5, so max should be 5
    await executor.executeParallel([
      "a1",
      "a2",
      "a3",
      "a4",
      "a5",
      "a6",
      "a7",
    ]);

    expect(maxConcurrent).toBeLessThanOrEqual(5);
    expect(mockExecute).toHaveBeenCalledTimes(7);
  });

  it("all agents run simultaneously when count <= maxConcurrency", async () => {
    const { createParallelExecutor } = await import("../parallel-executor");
    let concurrent = 0;
    let maxConcurrent = 0;

    const mockExecute = vi.fn().mockImplementation(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 20));
      concurrent--;
      return { result: "OK" };
    });

    // 3 agents with maxConcurrency=5 — all should run at once
    const executor = createParallelExecutor(mockExecute, {
      maxConcurrency: 5,
    });
    await executor.executeParallel(["developer", "reviewer", "planner"]);

    expect(maxConcurrent).toBe(3);
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });
});

// ─── buildExecutionPlan ──────────────────────────────────────────────────────

describe("buildExecutionPlan", () => {
  it("identifies independent steps that can run in parallel", async () => {
    const { buildExecutionPlan } = await import("../parallel-executor");

    // Simple linear workflow: all steps sequential
    const linearSteps = [
      "Plan the feature",
      "Implement the code",
      "Review the code",
    ];
    const plan = buildExecutionPlan(linearSteps);

    expect(plan).toBeDefined();
    expect(plan.groups).toBeDefined();
    expect(plan.groups.length).toBeGreaterThan(0);
  });

  it("returns sequential plan for single step", async () => {
    const { buildExecutionPlan } = await import("../parallel-executor");
    const plan = buildExecutionPlan(["Do something"]);
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0].steps).toHaveLength(1);
  });

  it("creates one group per step in sequential mode", async () => {
    const { buildExecutionPlan } = await import("../parallel-executor");
    const steps = ["Step A", "Step B", "Step C"];
    const plan = buildExecutionPlan(steps);
    expect(plan.groups).toHaveLength(3);
    // Each group contains exactly one step
    for (let i = 0; i < steps.length; i++) {
      expect(plan.groups[i].steps).toHaveLength(1);
      expect(plan.groups[i].steps[0]).toBe(steps[i]);
    }
  });

  it("assigns unique groupId to each group", async () => {
    const { buildExecutionPlan } = await import("../parallel-executor");
    const plan = buildExecutionPlan(["A", "B", "C"]);
    const ids = plan.groups.map((g) => g.groupId);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("returns empty groups for empty input", async () => {
    const { buildExecutionPlan } = await import("../parallel-executor");
    const plan = buildExecutionPlan([]);
    expect(plan.groups).toHaveLength(0);
  });

  it("groups are marked as not parallel in sequential mode", async () => {
    const { buildExecutionPlan } = await import("../parallel-executor");
    const plan = buildExecutionPlan(["A", "B"]);
    for (const group of plan.groups) {
      expect(group.parallel).toBe(false);
    }
  });
});
