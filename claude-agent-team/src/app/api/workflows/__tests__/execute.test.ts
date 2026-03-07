import { describe, it, expect } from "vitest";
import {
  executeWorkflow,
  createInitialState,
  type StepExecuteFn,
  type WorkflowExecutionState,
} from "@/lib/workflow-engine";

describe("Workflow Execute Integration", () => {
  const mockExecuteFn: StepExecuteFn = async (stepName, context) => {
    return `${stepName} 결과: context=${context.length}자`;
  };

  const failingExecuteFn: StepExecuteFn = async (stepName) => {
    throw new Error(`${stepName} 실패`);
  };

  it("유효한 워크플로우 → 모든 스텝 completed", async () => {
    const result = await executeWorkflow(
      "wf-1",
      ["developer", "reviewer"],
      mockExecuteFn,
      { retryPolicy: { maxRetries: 0, backoffMs: 0, backoffMultiplier: 1 } },
    );

    expect(result.status).toBe("completed");
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].status).toBe("completed");
    expect(result.steps[1].status).toBe("completed");
    expect(result.completedAt).toBeDefined();
  });

  it("빈 steps 배열 → 즉시 completed", async () => {
    const result = await executeWorkflow("wf-2", [], mockExecuteFn);

    expect(result.status).toBe("completed");
    expect(result.steps).toHaveLength(0);
  });

  it("스텝 실패 시 → failed + 나머지 skipped", async () => {
    const result = await executeWorkflow(
      "wf-3",
      ["developer", "reviewer", "writer"],
      failingExecuteFn,
      { retryPolicy: { maxRetries: 0, backoffMs: 0, backoffMultiplier: 1 } },
    );

    expect(result.status).toBe("failed");
    expect(result.steps[0].status).toBe("failed");
    expect(result.steps[1].status).toBe("skipped");
    expect(result.steps[2].status).toBe("skipped");
  });

  it("onStepComplete 콜백이 각 스텝마다 호출됨", async () => {
    const snapshots: WorkflowExecutionState[] = [];

    await executeWorkflow(
      "wf-4",
      ["developer", "reviewer"],
      mockExecuteFn,
      {
        retryPolicy: { maxRetries: 0, backoffMs: 0, backoffMultiplier: 1 },
        onStepComplete: (state) => snapshots.push(state),
      },
    );

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].steps[0].status).toBe("completed");
    expect(snapshots[1].steps[1].status).toBe("completed");
  });
});
