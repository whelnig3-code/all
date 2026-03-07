// ─── ChatArea 내부 공유 타입 ──────────────────────────────────────────────────
// ChatArea.tsx에서 분리된 타입들. ChatMessages, ChatInput, useChatStream에서 공유.

export interface ToolUsage {
  readonly tool: string;
  readonly input: Record<string, unknown>;
  readonly result?: string;
  readonly status: "running" | "done";
}

export interface PipelineNext {
  readonly nextAgent: string;
  readonly suggestion: string;
}

/** 라우팅 배지에 표시할 정보 */
export interface RoutingInfo {
  readonly method: "explicit" | "keyword" | "gate" | "fallback" | "loop-protect" | "inferred" | "project-default" | "default";
  readonly targetAgent: string;
  readonly matchedKeywords?: string[];
  readonly reason: string;
  readonly gateReason?: string;
  readonly originalAgent?: string;
}

export interface ChatMessageData {
  readonly id: string;
  readonly role: "user" | "agent" | "system";
  readonly content: string;
  readonly timestamp: Date;
  readonly agentId?: string;
  readonly isStreaming?: boolean;
  readonly toolUse?: ToolUsage[];
  readonly isPipeline?: boolean;
  readonly pipelineNext?: PipelineNext;
  /** Intent 라우팅 결과 — 에이전트 메시지 헤더 배지용 */
  readonly routing?: RoutingInfo;
}

/** 메시지 타임스탬프를 "HH:mm" 형식으로 변환 */
export function formatMsgTime(date: Date): string {
  return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

// Quick Start 카드
export const QUICK_START_CARDS = [
  { icon: "🏗️", title: "새 기능 개발", desc: "요구사항을 분석하고 구현 계획을 세워줘", prompt: "새 기능을 개발하려고 해. 요구사항 분석부터 시작해줘.", color: "#3B82F6" },
  { icon: "🔒", title: "보안 감사", desc: "현재 코드의 보안 취약점을 점검해줘", prompt: "현재 프로젝트 코드의 보안 취약점을 전체적으로 감사해줘.", color: "#EF4444" },
  { icon: "🎨", title: "UI/UX 디자인", desc: "화면 레이아웃 설계와 컴포넌트 구현", prompt: "UI/UX 디자인이 필요해. 와이어프레임부터 컴포넌트 코드까지 만들어줘.", color: "#EC4899" },
  { icon: "📝", title: "문서 정리", desc: "README 및 기술 문서를 최신화해줘", prompt: "프로젝트 README.md와 기술 문서를 최신 상태로 업데이트해줘.", color: "#F59E0B" },
] as const;

export const MESSAGES_PER_LOAD = 50;
