// ─── 에이전트 타입 ────────────────────────────────────────────────────────────

/** 내장 에이전트 ID (자동완성 지원) */
export type BuiltinAgentId =
  | "planner"
  | "developer"
  | "reviewer"
  | "writer"
  | "security-auditor"
  | "researcher"
  | "designer";

/** 내장 + 커스텀 에이전트 ID (모든 string 수용, 내장 ID 자동완성 유지) */
export type AgentId = BuiltinAgentId | (string & {});

export type AgentStatus = "idle" | "active" | "done" | "error" | "inactive";

export interface Agent {
  id: AgentId;
  name: string;
  icon: string;
  color: string;
  description: string;
  model: string;
  status: AgentStatus;
  currentTask?: string;
  active?: boolean;
}

// ─── SSE 이벤트 타입 ──────────────────────────────────────────────────────────

export type SSEEvent =
  | {
      type: "stream";
      agent?: string;
      content: string;
      status?: "active" | "done";
    }
  | {
      type: "agent";
      agent: string;
      content: string;
      status: "done" | "active";
    }
  | {
      type: "done";
      summary?: string;
    }
  | {
      type: "error";
      error: string;
    }
  | {
      type: "tool_use";
      agent?: string;
      toolName: string;
      toolInput: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      agent?: string;
      toolName: string;
      result: string;
    }
  | {
      type: "pipeline";
      agent: string;
      nextAgent: AgentId;
      pipelineMsg: string;
    }
  | {
      /** Intent 기반 라우팅 결과 이벤트 */
      type: "routing";
      /** 최종 선택된 에이전트 */
      agent: string;
      /**
       * 라우팅 결정 방법
       * - explicit     : 사용자가 UI에서 직접 선택
       * - keyword      : ROUTING_RULES 키워드 매칭
       * - gate         : GATE_RULES 강제 교정 (의도-에이전트 불일치)
       * - fallback     : 키워드 미매칭 → 기본값 developer
       * - loop-protect : 재방문/재귀/hopCount 초과 감지 → 루프 차단
       */
      method: "explicit" | "keyword" | "gate" | "fallback" | "loop-protect" | "inferred" | "project-default";
      /** 요청 직전 활성 에이전트 */
      sourceAgent?: string;
      /** 최종 선택 에이전트 */
      targetAgent: string;
      /** keyword 방법일 때 매칭된 키워드 목록 */
      matchedKeywords?: string[];
      /** 사람이 읽을 수 있는 라우팅 사유 */
      reason: string;
      /** gate 교정 시 사유 */
      gateReason?: string;
      /** gate/loop-protect 교정 전 원래 에이전트 */
      originalAgent?: string;
      /** 이 결과가 생성될 때의 홉 카운트 (멀티홉 추적용) */
      hopCount?: number;
      /**
       * Shadow Multi-Hop 전용: 다음 홉 후보 에이전트 목록.
       * ENABLE_SHADOW_MULTI_HOP=true 일 때만 포함됨.
       * 실제 에이전트 호출 없이 규칙 기반으로만 계산된 후보입니다.
       */
      nextCandidates?: string[];
      /** true = 라우팅 판단 불가, 사용자 에이전트 선택 필요 */
      isAmbiguous?: boolean;
    }
  | {
      /** 에이전트 판단 불가 — 사용자 선택 요청 */
      type: "needs_agent_select";
      /** 사용자에게 보여줄 안내 메시지 */
      reason: string;
    };

// ─── WebSocket 연결 상태 ──────────────────────────────────────────────────────

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

// ─── 프로젝트 타입 ────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  icon: string;
  description: string;
  path: string;
  createdAt: string;
  updatedAt: string;
  /** 프로젝트 기본 에이전트 — targetAgent 미지정 시 우선 사용 */
  defaultAgent?: AgentId;
}

// ─── 채팅 API 타입 ────────────────────────────────────────────────────────────

export interface ChatRequest {
  message: string;
  targetAgent?: AgentId;
  conversationId?: string;
  /** 프로젝트에 설정된 기본 에이전트 (targetAgent 미지정 시 2순위 fallback) */
  projectDefaultAgent?: AgentId;
}

export interface FileAttachment {
  name: string;
  kind: "image" | "file";
  content: string; // base64 data URL or text content
  mimeType?: string;
}

// ─── 채팅 메시지 타입 (ChatMessage 컴포넌트용) ────────────────────────────────

export interface ToolUsage {
  tool: string;
  input: Record<string, unknown>;
  result?: string;
  status: "running" | "done";
}

export interface PipelineNextInfo {
  nextAgent: string;
  suggestion: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  timestamp: Date;
  agentId?: string;
  isStreaming?: boolean;
  toolUse?: ToolUsage[];
  isPipeline?: boolean;
  pipelineNext?: PipelineNextInfo;
}
