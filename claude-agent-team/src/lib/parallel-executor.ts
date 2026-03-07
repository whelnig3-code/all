/**
 * parallel-executor.ts — Agent Parallel Execution Engine
 *
 * Executes multiple independent agents concurrently with bounded concurrency.
 * Like a restaurant kitchen where multiple chefs work on different dishes
 * simultaneously, but the kitchen has a limited number of stoves (maxConcurrency).
 *
 * Key design decisions:
 * - Promise.allSettled for graceful partial failure handling
 * - Semaphore pattern for bounded concurrency when agents exceed the limit
 * - Factory function (createParallelExecutor) for testability and DI
 * - All interfaces use `readonly` for immutability
 * - Pure functions, no side effects in the core logic
 */

// ─── Types ──────────────────────────────────────────────────────────────────

interface ExecutionResultFulfilled<T = unknown> {
  readonly status: "fulfilled";
  readonly agentId: string;
  readonly value: T;
}

interface ExecutionResultRejected {
  readonly status: "rejected";
  readonly agentId: string;
  readonly reason: Error;
}

export type ExecutionResult<T = unknown> =
  | ExecutionResultFulfilled<T>
  | ExecutionResultRejected;

export interface ParallelExecutorOptions {
  readonly maxConcurrency?: number;
}

export interface ExecutionGroup {
  readonly groupId: string;
  readonly steps: readonly string[];
  readonly parallel: boolean;
}

export interface ExecutionPlan {
  readonly groups: readonly ExecutionGroup[];
}

export type AgentExecuteFn<T = unknown> = (agentId: string) => Promise<T>;

// ─── Default constants ──────────────────────────────────────────────────────

const DEFAULT_MAX_CONCURRENCY = 5;

// ─── createParallelExecutor ─────────────────────────────────────────────────

/**
 * Creates a parallel executor that runs multiple agents concurrently.
 *
 * @param executeFn - Function to execute a single agent by ID
 * @param options   - Optional configuration (maxConcurrency)
 * @returns An executor with an `executeParallel` method
 */
export function createParallelExecutor<T = unknown>(
  executeFn: AgentExecuteFn<T>,
  options?: ParallelExecutorOptions,
) {
  const maxConcurrency = options?.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;

  /**
   * Execute multiple agents in parallel with bounded concurrency.
   *
   * When agentIds.length <= maxConcurrency, all agents run simultaneously
   * via Promise.allSettled. When there are more agents than the concurrency
   * limit, a semaphore pattern is used: new agents start as soon as a
   * running agent completes, never exceeding the limit.
   */
  async function executeParallel(
    agentIds: readonly string[],
  ): Promise<readonly ExecutionResult<T>[]> {
    if (agentIds.length === 0) return [];

    if (agentIds.length <= maxConcurrency) {
      // All can run at once — simple Promise.allSettled path
      const settled = await Promise.allSettled(
        agentIds.map((id) =>
          executeFn(id).then((value) => ({ agentId: id, value })),
        ),
      );

      return settled.map(
        (s, i): ExecutionResult<T> =>
          s.status === "fulfilled"
            ? {
                status: "fulfilled" as const,
                agentId: agentIds[i],
                value: s.value.value,
              }
            : {
                status: "rejected" as const,
                agentId: agentIds[i],
                reason: s.reason instanceof Error
                  ? s.reason
                  : new Error(String(s.reason)),
              },
      );
    }

    // Bounded concurrency with semaphore pattern
    // Like a waiting room: only maxConcurrency patients can be in the
    // doctor's office at once; the rest wait until a slot opens.
    const results: ExecutionResult<T>[] = [];
    const queue = [...agentIds];
    const executing = new Set<Promise<void>>();

    while (queue.length > 0 || executing.size > 0) {
      // Fill available slots from the queue
      while (queue.length > 0 && executing.size < maxConcurrency) {
        const agentId = queue.shift()!;
        const p = executeFn(agentId)
          .then((value) => {
            results.push({
              status: "fulfilled" as const,
              agentId,
              value,
            });
          })
          .catch((reason: unknown) => {
            results.push({
              status: "rejected" as const,
              agentId,
              reason: reason instanceof Error
                ? reason
                : new Error(String(reason)),
            });
          })
          .finally(() => {
            executing.delete(p);
          });
        executing.add(p);
      }

      // Wait for at least one slot to free up
      if (executing.size > 0) {
        await Promise.race(executing);
      }
    }

    return results;
  }

  return { executeParallel } as const;
}

// ─── buildExecutionPlan ─────────────────────────────────────────────────────

/**
 * Builds an execution plan from a list of workflow steps.
 *
 * Current implementation: simple sequential grouping where each step
 * becomes its own group. Like a recipe where each instruction is done
 * one at a time.
 *
 * Future enhancement: dependency analysis to identify steps that can
 * run in parallel (e.g., "write tests" and "write docs" can run
 * concurrently after "implement code").
 *
 * @param steps - Ordered list of step descriptions
 * @returns An ExecutionPlan with groups of steps
 */
export function buildExecutionPlan(steps: readonly string[]): ExecutionPlan {
  const groups: readonly ExecutionGroup[] = steps.map(
    (step, i): ExecutionGroup => ({
      groupId: `group-${i}`,
      steps: [step],
      parallel: false,
    }),
  );

  return { groups };
}
