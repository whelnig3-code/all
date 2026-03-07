/**
 * workflow-engine.ts — State-machine-based Workflow Execution Engine
 *
 * Think of a factory assembly line: raw materials enter at one end, pass through
 * stations (steps) in order, and each station adds value using the accumulated
 * output from previous stations. If a station fails, it retries with exponential
 * backoff — like re-inspecting a part before scrapping the whole batch.
 *
 * Key design decisions:
 * - Pure functions for state transitions (transitionStatus, createInitialState, etc.)
 * - Immutable state snapshots — every update creates a new object via spread
 * - Injected step executor (StepExecuteFn) for testability
 * - Exponential backoff retries with configurable policy
 * - Context chaining — each step receives accumulated outputs from prior steps
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type WorkflowStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type StepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export interface StepResult {
  readonly stepIndex: number;
  readonly stepName: string;
  readonly status: StepStatus;
  readonly output?: string;
  readonly error?: string;
  readonly durationMs: number;
  readonly retriesUsed: number;
}

export interface RetryPolicy {
  readonly maxRetries: number;
  readonly backoffMs: number;
  readonly backoffMultiplier: number;
}

export interface WorkflowExecutionState {
  readonly workflowId: string;
  readonly status: WorkflowStatus;
  readonly currentStepIndex: number;
  readonly steps: readonly StepResult[];
  readonly startedAt: number;
  readonly completedAt?: number;
  readonly totalDurationMs: number;
  readonly contextChain: readonly string[];
}

export type StepExecuteFn = (
  stepName: string,
  context: string,
) => Promise<string>;

export interface WorkflowEngineOptions {
  readonly retryPolicy?: Partial<RetryPolicy>;
  readonly onStepComplete?: (state: WorkflowExecutionState) => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 1000;
const DEFAULT_BACKOFF_MULTIPLIER = 2;
const CONTEXT_SEPARATOR = "\n---\n";

// ─── Valid state transitions ────────────────────────────────────────────────

type TransitionEvent =
  | "start"
  | "step_complete"
  | "step_fail"
  | "cancel"
  | "all_done";

const VALID_TRANSITIONS: Record<
  WorkflowStatus,
  Partial<Record<TransitionEvent, WorkflowStatus>>
> = {
  pending: {
    start: "running",
    cancel: "cancelled",
  },
  running: {
    step_complete: "running",
    step_fail: "failed",
    cancel: "cancelled",
    all_done: "completed",
  },
  completed: {},
  failed: {},
  cancelled: {},
};

// ─── Pure Functions ─────────────────────────────────────────────────────────

/**
 * Transition the workflow status based on an event.
 * Like a traffic light: only certain color changes are valid.
 * Invalid transitions return the current status unchanged.
 */
export function transitionStatus(
  current: WorkflowStatus,
  event: TransitionEvent,
): WorkflowStatus {
  const nextStatus = VALID_TRANSITIONS[current][event];
  return nextStatus ?? current;
}

/**
 * Create the initial execution state for a workflow.
 * Sets up all steps as "pending" with zero duration and no output.
 */
export function createInitialState(
  workflowId: string,
  steps: readonly string[],
): WorkflowExecutionState {
  const now = Date.now();

  const stepResults: readonly StepResult[] = steps.map(
    (stepName, index): StepResult => ({
      stepIndex: index,
      stepName,
      status: "pending",
      output: undefined,
      error: undefined,
      durationMs: 0,
      retriesUsed: 0,
    }),
  );

  return {
    workflowId,
    status: "pending",
    currentStepIndex: 0,
    steps: stepResults,
    startedAt: now,
    completedAt: undefined,
    totalDurationMs: 0,
    contextChain: [],
  };
}

/**
 * Create a retry policy with defaults, optionally overridden.
 * Like configuring how many re-inspections a factory part gets.
 */
export function createRetryPolicy(
  overrides?: Partial<RetryPolicy>,
): RetryPolicy {
  return {
    maxRetries: overrides?.maxRetries ?? DEFAULT_MAX_RETRIES,
    backoffMs: overrides?.backoffMs ?? DEFAULT_BACKOFF_MS,
    backoffMultiplier: overrides?.backoffMultiplier ?? DEFAULT_BACKOFF_MULTIPLIER,
  };
}

/**
 * Calculate the backoff delay for a given retry attempt.
 * Uses exponential backoff: delay = backoffMs * multiplier^attempt
 */
export function calculateBackoff(
  attempt: number,
  policy: RetryPolicy,
): number {
  return policy.backoffMs * Math.pow(policy.backoffMultiplier, attempt);
}

// ─── Internal helpers (pure state updates) ──────────────────────────────────

function updateStepInState(
  state: WorkflowExecutionState,
  stepIndex: number,
  stepUpdate: Partial<StepResult>,
): WorkflowExecutionState {
  return {
    ...state,
    steps: state.steps.map((step, i) =>
      i === stepIndex ? { ...step, ...stepUpdate } : step,
    ),
  };
}

function buildContext(contextChain: readonly string[]): string {
  return contextChain.join(CONTEXT_SEPARATOR);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Main Execution ─────────────────────────────────────────────────────────

/**
 * Execute a workflow by running each step sequentially.
 *
 * Like running a factory assembly line: each station processes the part,
 * adds its result to the accumulated context, and passes it to the next.
 * If a station fails, it retries according to the retry policy.
 * If retries are exhausted, remaining stations are skipped and the
 * workflow is marked as failed.
 */
export async function executeWorkflow(
  workflowId: string,
  steps: readonly string[],
  executeFn: StepExecuteFn,
  options?: WorkflowEngineOptions,
): Promise<WorkflowExecutionState> {
  const retryPolicy = createRetryPolicy(options?.retryPolicy);
  let state = createInitialState(workflowId, steps);

  // Handle empty workflow
  if (steps.length === 0) {
    const now = Date.now();
    return {
      ...state,
      status: transitionStatus(
        transitionStatus(state.status, "start"),
        "all_done",
      ),
      completedAt: now,
      totalDurationMs: now - state.startedAt,
    };
  }

  // Transition to running
  state = {
    ...state,
    status: transitionStatus(state.status, "start"),
  };

  for (let i = 0; i < steps.length; i++) {
    const stepName = steps[i];
    const context = buildContext(state.contextChain);
    const stepStart = Date.now();

    // Mark step as running
    state = {
      ...updateStepInState(state, i, { status: "running" }),
      currentStepIndex: i,
    };

    let succeeded = false;
    let lastError: string | undefined;
    let retriesUsed = 0;

    // Attempt execution with retries
    for (let attempt = 0; attempt <= retryPolicy.maxRetries; attempt++) {
      try {
        const output = await executeFn(stepName, context);
        const stepEnd = Date.now();

        // Step succeeded
        state = {
          ...updateStepInState(state, i, {
            status: "completed",
            output,
            durationMs: stepEnd - stepStart,
            retriesUsed,
          }),
          currentStepIndex: i + 1,
          contextChain: [...state.contextChain, output],
        };

        succeeded = true;
        break;
      } catch (err: unknown) {
        lastError =
          err instanceof Error ? err.message : String(err);
        retriesUsed = attempt + 1 <= retryPolicy.maxRetries ? attempt + 1 : attempt;

        // Wait before retrying (if not the last attempt)
        if (attempt < retryPolicy.maxRetries) {
          await delay(calculateBackoff(attempt, retryPolicy));
        }
      }
    }

    if (succeeded) {
      // Notify callback with immutable snapshot
      if (options?.onStepComplete) {
        options.onStepComplete({ ...state });
      }
      continue;
    }

    // Step failed after all retries
    const stepEnd = Date.now();
    state = {
      ...updateStepInState(state, i, {
        status: "failed",
        error: lastError,
        durationMs: stepEnd - stepStart,
        retriesUsed: retryPolicy.maxRetries,
      }),
      status: transitionStatus(state.status, "step_fail"),
      currentStepIndex: i,
    };

    // Mark remaining steps as skipped
    for (let j = i + 1; j < steps.length; j++) {
      state = updateStepInState(state, j, { status: "skipped" });
    }

    const now = Date.now();
    return {
      ...state,
      completedAt: now,
      totalDurationMs: now - state.startedAt,
    };
  }

  // All steps completed
  const now = Date.now();
  return {
    ...state,
    status: transitionStatus(state.status, "all_done"),
    completedAt: now,
    totalDurationMs: now - state.startedAt,
  };
}
