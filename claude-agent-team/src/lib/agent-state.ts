/**
 * agent-state.ts — Agent state management
 *
 * Manages agent active/inactive status, agent status map (idle/active/done/error),
 * socket broadcast setup, and abort controller for cancellation.
 *
 * Extracted from agent-manager.ts for single-responsibility.
 * All exports are re-exported from agent-manager.ts for backward compatibility.
 */
import { AgentId, AgentStatus } from "@/types";
import { AGENTS_CONFIG } from "@/config/agents";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("agent-state");

// ── Socket broadcast (서버 사이드에서만 동적으로 임포트) ──────────────────────
// 클라이언트 사이드에서 이 모듈이 번들링될 경우를 대비하여 안전하게 처리합니다.
let socketBroadcast:
  | ((agentId: string, status: string, task?: string) => void)
  | null = null;

try {
  // Next.js 서버 환경(window 객체 없음)에서만 socket-server 임포트
  if (typeof window === "undefined") {
    import("./socket-server")
      .then((m) => {
        socketBroadcast = m.broadcastAgentStatus;
      })
      .catch(() => {
        // socket-server 로드 실패 시 조용히 무시 (WebSocket 없이 동작)
      });
  }
} catch {
  // 예외 발생 시 무시
}

/** 현재 소켓 브로드캐스트 함수를 반환 (연결 전이면 null) */
export function getSocketBroadcast() {
  return socketBroadcast;
}

// ── 에이전트 상태 관리 (인메모리, 단일 맵으로 통합) ──────────────────────────
interface AgentState {
  active: boolean;
  status: AgentStatus;
}

const agentStateMap: Record<string, AgentState> = {
  planner:            { active: true, status: "idle" },
  developer:          { active: true, status: "idle" },
  reviewer:           { active: true, status: "idle" },
  writer:             { active: true, status: "idle" },
  "security-auditor": { active: true, status: "idle" },
  researcher:         { active: true, status: "idle" },
  designer:           { active: true, status: "idle" },
};

// ── 동적 에이전트 등록/해제 (커스텀 에이전트 지원) ───────────────────────────

/** 커스텀 에이전트를 상태 맵에 등록 (이미 있으면 무시) */
export function registerAgent(agentId: string): void {
  if (!agentStateMap[agentId]) {
    agentStateMap[agentId] = { active: true, status: "idle" };
  }
}

/** 커스텀 에이전트를 상태 맵에서 제거 (내장 에이전트는 제거 불가) */
export function unregisterAgent(agentId: string): void {
  if (agentId in AGENTS_CONFIG) return; // 내장 에이전트 보호
  delete agentStateMap[agentId];
}

// ── 에이전트 상태 접근자 ─────────────────────────────────────────────────────

/** 에이전트 활성화 여부 확인 */
export function isAgentActive(agentId: string): boolean {
  return agentStateMap[agentId]?.active ?? true;
}

/** 에이전트 상태(idle/active/done/error) 읽기 */
export function getAgentStatus(agentId: string): AgentStatus {
  return agentStateMap[agentId]?.status ?? "idle";
}

/** 에이전트 상태(idle/active/done/error) 설정 — 미등록 에이전트는 자동 등록 */
export function setAgentStatus(agentId: string, status: AgentStatus): void {
  if (!agentStateMap[agentId]) {
    agentStateMap[agentId] = { active: true, status };
    return;
  }
  agentStateMap[agentId] = { ...agentStateMap[agentId], status };
}

// ── 에이전트 상태 조회 (전체 목록) ────────────────────────────────────────────
export function getAgentStatuses() {
  return Object.values(AGENTS_CONFIG).map((config) => ({
    ...config,
    status: agentStateMap[config.id]?.status ?? "idle",
    active: agentStateMap[config.id]?.active ?? true,
  }));
}

// ── 에이전트 활성/비활성 전환 ─────────────────────────────────────────────────
export function toggleAgent(agentId: AgentId, active: boolean) {
  if (!agentStateMap[agentId]) {
    agentStateMap[agentId] = { active, status: "idle" };
  } else {
    agentStateMap[agentId] = { ...agentStateMap[agentId], active };
  }
  socketBroadcast?.(agentId, active ? "idle" : "inactive");
}

// ── AbortController 관리 (에이전트 작업 중단 기능) ─────────────────────────────
// 서버 인스턴스당 하나의 요청만 중단 대상으로 관리
let currentAbortController: AbortController | null = null;

/** 현재 AbortController 반환 */
export function getCurrentAbortController(): AbortController | null {
  return currentAbortController;
}

/** 새 AbortController 설정 (이전 컨트롤러는 자동 abort) */
export function setCurrentAbortController(ctrl: AbortController | null): void {
  // 새 컨트롤러로 교체할 때 이전 것을 abort하여 동시 요청 충돌 방지
  if (currentAbortController && ctrl !== null) {
    currentAbortController.abort();
  }
  currentAbortController = ctrl;
}

// 현재 실행 중인 에이전트 작업 중단
// 반환값: true = 중단 성공, false = 실행 중인 작업 없음
export function cancelCurrentAgent(): boolean {
  if (currentAbortController) {
    // AbortController 신호를 발생시켜 실행 중인 루프 탈출
    currentAbortController.abort();
    currentAbortController = null;
    // 모든 active 상태 에이전트를 idle로 초기화
    Object.entries(agentStateMap).forEach(([id, state]) => {
      if (state.status === "active") {
        state.status = "idle";
        socketBroadcast?.(id, "idle");
      }
    });
    log.info("All active agents reset to idle due to cancellation");
    return true;
  }
  return false;
}
