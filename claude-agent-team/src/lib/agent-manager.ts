/**
 * agent-manager.ts — Main orchestrator (thin entry point)
 *
 * This module re-exports all public API from the split sub-modules
 * for backward compatibility. All callers can continue importing from
 * "@/lib/agent-manager" without changes.
 *
 * Sub-modules:
 *   - agent-state.ts     — Agent status management, toggle, cancel
 *   - agent-telemetry.ts — Statistics, telemetry, timeout/token config
 *   - agent-executor.ts  — Message processing, SSE streaming, Claude API calls
 */
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("agent-manager");

// [AGENT] 모듈 초기화 로그 (서버 부팅 시 1회 출력)
log.info("agent-manager booted");

// ── Re-exports from agent-state.ts ───────────────────────────────────────────
export {
  getAgentStatuses,
  toggleAgent,
  cancelCurrentAgent,
  registerAgent,
  unregisterAgent,
} from "./agent-state";

// ── Re-exports from agent-telemetry.ts ───────────────────────────────────────
export { getApiStats } from "./agent-telemetry";

// ── Re-exports from agent-executor.ts ────────────────────────────────────────
export { processUserMessage } from "./agent-executor";
