/**
 * workflow-engine.ts unit tests (TDD)
 *
 * Tests for the state-machine-based workflow execution engine.
 * Like a factory assembly line: each step must complete before the next
 * begins, with retry logic acting as quality-control re-inspection.
 *
 * Test cases cover:
 * - State machine transitions (pure function)
 * - Initial state creation
 * - Retry policy defaults and overrides
 * - Exponential backoff calculation
 * - Full workflow execution (empty, single, multi-step)
 * - Retry on failure, exhaustion
 * - Callback invocation
 * - Immutability guarantees
 * - Duration tracking
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import type {
  WorkflowExecutionState,
  StepExecuteFn,
} from "../workflow-engine";

import {
  transitionStatus,
  createInitialState,
  createRetryPolicy,
  calculateBackoff,
  executeWorkflow,
} from "../workflow-engine";

// ─── transitionStatus ────────────────────────────────────────────────────────

describe("transitionStatus", () => {
  it("transitions from pending to running on start", () => {
    expect(transitionStatus("pending", "start")).toBe("running");
  });

  it("stays running on step_complete when more steps remain", () => {
    expect(transitionStatus("running", "step_complete")).toBe("running");
  });

  it("transitions from running to completed on all_done", () => {
    expect(transitionStatus("running", "all_done")).toBe("completed");
  });

  it("transitions from running to failed on step_fail", () => {
    expect(transitionStatus("running", "step_fail")).toBe("failed");
  });

  it("transitions from running to cancelled on cancel", () => {
    expect(transitionStatus("running", "cancel")).toBe("cancelled");
  });

  it("transitions from pending to cancelled on cancel", () => {
    expect(transitionStatus("pending", "cancel")).toBe("cancelled");
  });

  it("returns current status for invalid transitions", () => {
    // completed is a terminal state — cannot start again
    expect(transitionStatus("completed", "start")).toBe("completed");
    expect(transitionStatus("failed", "start")).toBe("failed");
    expect(transitionStatus("cancelled", "start")).toBe("cancelled");
    // pending cannot receive step_complete
    expect(transitionStatus("pending", "step_complete")).toBe("pending");
    expect(transitionStatus("pending", "step_fail")).toBe("pending");
    expect(transitionStatus("pending", "all_done")).toBe("pending");
  });
});

// ─── createInitialState ──────────────────────────────────────────────────────

describe("createInitialState", () => {
  it("creates state with correct defaults", () => {
    const steps = ["Plan", "Implement", "Review"];
    const state = createInitialState("wf-1", steps);

    expect(state.workflowId).toBe("wf-1");
    expect(state.status).toBe("pending");
    expect(state.currentStepIndex).toBe(0);
    expect(state.steps).toHaveLength(3);
    expect(state.startedAt).toBeGreaterThan(0);
    expect(state.completedAt).toBeUndefined();
    expect(state.totalDurationMs).toBe(0);
    expect(state.contextChain).toEqual([]);
  });

  it("initializes each step with pending status", () => {
    const state = createInitialState("wf-2", ["A", "B"]);

    for (let i = 0; i < state.steps.length; i++) {
      expect(state.steps[i].stepIndex).toBe(i);
      expect(state.steps[i].stepName).toBe(i === 0 ? "A" : "B");
      expect(state.steps[i].status).toBe("pending");
      expect(state.steps[i].output).toBeUndefined();
      expect(state.steps[i].error).toBeUndefined();
      expect(state.steps[i].durationMs).toBe(0);
      expect(state.steps[i].retriesUsed).toBe(0);
    }
  });

  it("handles empty steps array", () => {
    const state = createInitialState("wf-empty", []);
    expect(state.steps).toHaveLength(0);
    expect(state.currentStepIndex).toBe(0);
  });
});

// ─── createRetryPolicy ──────────────────────────────────────────────────────

describe("createRetryPolicy", () => {
  it("returns correct defaults when no overrides", () => {
    const policy = createRetryPolicy();
    expect(policy.maxRetries).toBe(2);
    expect(policy.backoffMs).toBe(1000);
    expect(policy.backoffMultiplier).toBe(2);
  });

  it("applies partial overrides", () => {
    const policy = createRetryPolicy({ maxRetries: 5 });
    expect(policy.maxRetries).toBe(5);
    expect(policy.backoffMs).toBe(1000);
    expect(policy.backoffMultiplier).toBe(2);
  });

  it("applies full overrides", () => {
    const policy = createRetryPolicy({
      maxRetries: 3,
      backoffMs: 500,
      backoffMultiplier: 3,
    });
    expect(policy.maxRetries).toBe(3);
    expect(policy.backoffMs).toBe(500);
    expect(policy.backoffMultiplier).toBe(3);
  });
});

// ─── calculateBackoff ────────────────────────────────────────────────────────

describe("calculateBackoff", () => {
  const defaultPolicy = createRetryPolicy();

  it("returns base backoff for attempt 0", () => {
    // attempt 0: 1000 * 2^0 = 1000
    expect(calculateBackoff(0, defaultPolicy)).toBe(1000);
  });

  it("doubles backoff for attempt 1", () => {
    // attempt 1: 1000 * 2^1 = 2000
    expect(calculateBackoff(1, defaultPolicy)).toBe(2000);
  });

  it("quadruples backoff for attempt 2", () => {
    // attempt 2: 1000 * 2^2 = 4000
    expect(calculateBackoff(2, defaultPolicy)).toBe(4000);
  });

  it("respects custom policy values", () => {
    const customPolicy = createRetryPolicy({
      backoffMs: 500,
      backoffMultiplier: 3,
    });
    // attempt 0: 500 * 3^0 = 500
    expect(calculateBackoff(0, customPolicy)).toBe(500);
    // attempt 1: 500 * 3^1 = 1500
    expect(calculateBackoff(1, customPolicy)).toBe(1500);
    // attempt 2: 500 * 3^2 = 4500
    expect(calculateBackoff(2, customPolicy)).toBe(4500);
  });
});

// ─── executeWorkflow ─────────────────────────────────────────────────────────

describe("executeWorkflow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("completes immediately for empty steps", async () => {
    const executeFn: StepExecuteFn = vi.fn();

    const resultPromise = executeWorkflow("wf-empty", [], executeFn);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.status).toBe("completed");
    expect(result.steps).toHaveLength(0);
    expect(result.completedAt).toBeDefined();
    expect(executeFn).not.toHaveBeenCalled();
  });

  it("executes a single step successfully", async () => {
    const executeFn: StepExecuteFn = vi
      .fn()
      .mockResolvedValue("step-output");

    const resultPromise = executeWorkflow("wf-single", ["Do work"], executeFn);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.status).toBe("completed");
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].status).toBe("completed");
    expect(result.steps[0].output).toBe("step-output");
    expect(result.steps[0].stepName).toBe("Do work");
    expect(result.completedAt).toBeDefined();
    expect(executeFn).toHaveBeenCalledWith("Do work", "");
  });

  it("chains context across multiple steps", async () => {
    const executeFn: StepExecuteFn = vi
      .fn()
      .mockImplementation(async (stepName: string) => {
        return `output-of-${stepName}`;
      });

    const steps = ["Step A", "Step B", "Step C"];
    const resultPromise = executeWorkflow("wf-chain", steps, executeFn);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.status).toBe("completed");
    expect(result.steps).toHaveLength(3);

    // First step receives empty context
    expect(executeFn).toHaveBeenCalledWith("Step A", "");
    // Second step receives first step's output
    expect(executeFn).toHaveBeenCalledWith("Step B", "output-of-Step A");
    // Third step receives accumulated context
    expect(executeFn).toHaveBeenCalledWith(
      "Step C",
      "output-of-Step A\n---\noutput-of-Step B",
    );

    expect(result.contextChain).toEqual([
      "output-of-Step A",
      "output-of-Step B",
      "output-of-Step C",
    ]);
  });

  it("retries a failed step and succeeds", async () => {
    let callCount = 0;
    const executeFn: StepExecuteFn = vi
      .fn()
      .mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Transient failure");
        }
        return "recovered-output";
      });

    const resultPromise = executeWorkflow(
      "wf-retry",
      ["Flaky step"],
      executeFn,
      { retryPolicy: { maxRetries: 2, backoffMs: 100 } },
    );
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.status).toBe("completed");
    expect(result.steps[0].status).toBe("completed");
    expect(result.steps[0].output).toBe("recovered-output");
    expect(result.steps[0].retriesUsed).toBe(1);
  });

  it("fails workflow when retries are exhausted", async () => {
    const executeFn: StepExecuteFn = vi
      .fn()
      .mockRejectedValue(new Error("Permanent failure"));

    const resultPromise = executeWorkflow(
      "wf-fail",
      ["Bad step"],
      executeFn,
      { retryPolicy: { maxRetries: 2, backoffMs: 100 } },
    );
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.status).toBe("failed");
    expect(result.steps[0].status).toBe("failed");
    expect(result.steps[0].error).toBe("Permanent failure");
    // 1 initial + 2 retries = 3 calls total, retriesUsed = 2
    expect(result.steps[0].retriesUsed).toBe(2);
    expect(executeFn).toHaveBeenCalledTimes(3);
  });

  it("calls onStepComplete callback after each step", async () => {
    const executeFn: StepExecuteFn = vi
      .fn()
      .mockImplementation(async (stepName: string) => `done-${stepName}`);
    const onStepComplete = vi.fn();

    const steps = ["A", "B", "C"];
    const resultPromise = executeWorkflow("wf-cb", steps, executeFn, {
      onStepComplete,
    });
    await vi.runAllTimersAsync();
    await resultPromise;

    expect(onStepComplete).toHaveBeenCalledTimes(3);
    // Each callback should receive a state snapshot
    for (let i = 0; i < 3; i++) {
      const callState: WorkflowExecutionState =
        onStepComplete.mock.calls[i][0];
      expect(callState.workflowId).toBe("wf-cb");
      expect(callState.steps[i].status).toBe("completed");
    }
  });

  it("produces immutable state snapshots", async () => {
    const snapshots: WorkflowExecutionState[] = [];
    const onStepComplete = vi
      .fn()
      .mockImplementation((state: WorkflowExecutionState) => {
        snapshots.push(state);
      });

    const executeFn: StepExecuteFn = vi
      .fn()
      .mockImplementation(async (stepName: string) => `out-${stepName}`);

    const resultPromise = executeWorkflow(
      "wf-immut",
      ["X", "Y"],
      executeFn,
      { onStepComplete },
    );
    await vi.runAllTimersAsync();
    const final = await resultPromise;

    // Snapshot from step 0 should not be mutated by step 1
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].currentStepIndex).toBe(1);
    expect(snapshots[1].currentStepIndex).toBe(2);

    // Final state is different from earlier snapshots
    expect(final.status).toBe("completed");
    expect(snapshots[0].status).toBe("running");

    // Verify the snapshots are distinct objects
    expect(snapshots[0]).not.toBe(snapshots[1]);
    expect(snapshots[1]).not.toBe(final);
  });

  it("calculates totalDurationMs correctly", async () => {
    vi.useRealTimers();

    const executeFn: StepExecuteFn = vi
      .fn()
      .mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return "done";
      });

    const result = await executeWorkflow(
      "wf-dur",
      ["Slow step"],
      executeFn,
    );

    expect(result.status).toBe("completed");
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(40);
    expect(result.completedAt).toBeDefined();
    expect(result.completedAt! - result.startedAt).toBeGreaterThanOrEqual(40);
  });

  it("marks remaining steps as skipped when workflow fails", async () => {
    let callCount = 0;
    const executeFn: StepExecuteFn = vi
      .fn()
      .mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error("Fail at step 2");
        }
        return `output-${callCount}`;
      });

    const resultPromise = executeWorkflow(
      "wf-skip",
      ["A", "B", "C"],
      executeFn,
      { retryPolicy: { maxRetries: 0 } },
    );
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.status).toBe("failed");
    expect(result.steps[0].status).toBe("completed");
    expect(result.steps[1].status).toBe("failed");
    expect(result.steps[2].status).toBe("skipped");
  });
});
