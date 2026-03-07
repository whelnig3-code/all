"use client";

import { useRef, useState, useCallback } from "react";
import { AgentId, AgentStatus, SSEEvent } from "@/types";
import { showErrorToast } from "@/lib/toast-events";
import { ChatMessageData, RoutingInfo } from "./chat-types";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface UseChatStreamParams {
  readonly conversationId: string | null;
  readonly targetAgent: AgentId | null;
  readonly externalTargetAgent?: string | null;
  readonly projectDefaultAgent?: AgentId;
  readonly messages: readonly ChatMessageData[];
  readonly onAutoNewConversation?: () => Promise<string>;
  readonly onLoadingChange?: (loading: boolean) => void;
  readonly onConversationUpdate?: () => void;
  readonly onTeamAgentsClear?: () => void;
  readonly onAgentStatusChange?: (agentId: string, status: AgentStatus, currentTask?: string) => void;
  readonly onExternalTargetAgentClear?: () => void;
  readonly onPreviewContent?: (content: string) => void;
  readonly onRoutingEvent?: (event: RoutingInfo & { timestamp: number }) => void;
  readonly onAutoTitleUpdate?: (conversationId: string, firstMessage: string) => void;
  readonly setMessages: React.Dispatch<React.SetStateAction<ChatMessageData[]>>;
  readonly setTargetAgent: React.Dispatch<React.SetStateAction<AgentId | null>>;
  readonly setNeedsAgentSelect: React.Dispatch<React.SetStateAction<string | null>>;
  readonly setInput: React.Dispatch<React.SetStateAction<string>>;
}

interface UseChatStreamReturn {
  readonly isLoading: boolean;
  readonly abortRef: React.RefObject<AbortController | null>;
  readonly handleSend: (overridePrompt?: string, overrideAgent?: AgentId) => Promise<void>;
}

// ─── 의도 추론 (클라이언트 사이드) ──────────────────────────────────────────────

/**
 * 메시지 내용으로 에이전트를 추론합니다 (클라이언트 사이드).
 * agent-router.ts의 classifyMessageIntent 규칙을 미러링합니다.
 *
 * 비유: 접수대 직원이 방문자의 말을 듣고 즉시 적합한 부서로 안내.
 * 11개 의도 카테고리를 순서대로 매칭하여 항상 유효한 AgentId를 반환합니다.
 *
 * @returns 추론된 AgentId (절대 null 반환하지 않음)
 */
function inferIntentForAgent(message: string): AgentId {
  const lower = message.toLowerCase();
  // 전문 에이전트 (우선순위 높음)
  if (/보안|취약|owasp|security/i.test(lower)) return "security-auditor";
  if (/리뷰|검토|review\b/i.test(lower)) return "reviewer";
  if (/설계|기획|계획|아키텍처|\bplan\b/i.test(lower)) return "planner";
  if (/디자인|와이어프레임|ui\s*설계|ux\b/i.test(lower)) return "designer";
  if (/조사|리서치|research|비교|추천|최신|트렌드/i.test(lower)) return "researcher";
  if (/문서|readme|가이드|changelog|매뉴얼/i.test(lower)) return "writer";
  // 범용 에이전트 (developer)
  if (/버그|에러|오류|안돼|안되|고쳐|\bfix\b|\bbug\b/i.test(lower)) return "developer";
  if (/구현|만들어|개발|코딩|코드|함수|컴포넌트|```|작성해|추가해/i.test(lower)) return "developer";
  if (/어떻게|뭐|왜|설명해|알려줘|무엇|\?$/i.test(lower)) return "developer";
  if (/^(안녕|하이|hello|hi|hey|반가|테스트|test)\b/i.test(lower)) return "developer";
  // 최종 기본값: developer (절대 null 반환 금지)
  return "developer";
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useChatStream({
  conversationId,
  targetAgent,
  externalTargetAgent,
  projectDefaultAgent,
  messages,
  onAutoNewConversation,
  onLoadingChange,
  onConversationUpdate,
  onTeamAgentsClear,
  onAgentStatusChange,
  onExternalTargetAgentClear,
  onPreviewContent,
  onRoutingEvent,
  onAutoTitleUpdate,
  setMessages,
  setTargetAgent,
  setNeedsAgentSelect,
  setInput,
}: UseChatStreamParams): UseChatStreamReturn {
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // 스트리밍 중인 에이전트 콘텐츠 추적 (Preview 콜백용, 메시지 흐름 미변경)
  const activeAgentContentRef = useRef<string>("");
  // 다음 에이전트 메시지에 붙일 라우팅 정보 (routing SSE -> stream SSE 순서 보장)
  const pendingRoutingRef = useRef<RoutingInfo | null>(null);

  const handleSend = useCallback(async (overridePrompt?: string, overrideAgent?: AgentId) => {
    // input 값은 외부에서 주입된 overridePrompt가 없으면 빈 문자열로 처리
    // (실제 input 값은 ChatArea에서 overridePrompt 또는 input 텍스트를 넘겨줌)
    const text = (overridePrompt ?? "").trim();
    if (!text || isLoading) return;

    setIsLoading(true);
    onLoadingChange?.(true);

    let effectiveConvId = conversationId;
    const isFirstMessage = messages.filter((m) => m.role === "user").length === 0;

    if (!effectiveConvId) {
      if (!onAutoNewConversation) {
        setIsLoading(false);
        onLoadingChange?.(false);
        return;
      }
      try {
        effectiveConvId = await onAutoNewConversation();
      } catch {
        setIsLoading(false);
        onLoadingChange?.(false);
        return;
      }
    }

    // 첫 메시지면 대화 제목 자동 설정
    if (isFirstMessage && effectiveConvId) {
      onAutoTitleUpdate?.(effectiveConvId, text);
    }

    // 에이전트 결정 (우선순위: override -> explicit -> projectDefault -> inferIntent -> 선택 UI)
    let effectiveTargetAgent: AgentId | undefined =
      overrideAgent ?? targetAgent ?? (externalTargetAgent as AgentId | undefined) ?? undefined;
    if (externalTargetAgent) onExternalTargetAgentClear?.();
    setTargetAgent(null);

    if (!effectiveTargetAgent) {
      // 우선순위 2: 프로젝트 기본 에이전트
      if (projectDefaultAgent) {
        effectiveTargetAgent = projectDefaultAgent;
      } else {
        // 우선순위 3: 의도 추론 (항상 유효한 AgentId 반환, null 없음)
        effectiveTargetAgent = inferIntentForAgent(text);
      }
    }

    let agentMsgId: string | null = null;

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversationId: effectiveConvId,
          targetAgent: effectiveTargetAgent,
          projectDefaultAgent,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) throw new Error(`서버 오류: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          const raw = dataLine.slice(6).trim();
          if (raw === "[DONE]") break;

          let event: SSEEvent;
          try {
            event = JSON.parse(raw);
          } catch {
            continue;
          }

          if (event.type === "stream") {
            const agentId = ("agent" in event ? event.agent : undefined) as string | undefined;
            if (!agentMsgId) {
              agentMsgId = `agent-${Date.now()}`;
              // Preview용 콘텐츠 추적 초기화
              activeAgentContentRef.current = event.content ?? "";
              // 대기 중인 라우팅 정보 소비 (routing SSE -> stream SSE 순서로 도착)
              const routing = pendingRoutingRef.current ?? undefined;
              pendingRoutingRef.current = null;
              setMessages((prev) => [
                ...prev,
                {
                  id: agentMsgId!,
                  role: "agent" as const,
                  agentId: agentId,
                  content: event.content ?? "",
                  timestamp: new Date(),
                  isStreaming: true,
                  routing,  // 라우팅 배지 데이터
                },
              ]);
              if (agentId) {
                onAgentStatusChange?.(agentId, "active", text.slice(0, 50));
              }
            } else {
              // Preview용 콘텐츠 누적
              activeAgentContentRef.current += event.content ?? "";
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === agentMsgId
                    ? { ...m, content: m.content + (event.content ?? "") }
                    : m
                )
              );
            }
          }

          if (event.type === "agent") {
            const agentId = ("agent" in event ? event.agent : undefined) as string | undefined;
            const agentEventStatus = ("status" in event ? event.status : undefined) as string | undefined;
            // "active" 상태면 작업 시작 알림 (스트리밍 없이 직접 agent 이벤트로 시작 알리는 경우)
            if (agentEventStatus === "active") {
              if (agentId) onAgentStatusChange?.(agentId, "active");
            } else {
              // "done" 또는 상태 없음: 작업 완료
              if (agentMsgId) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === agentMsgId
                      ? { ...m, isStreaming: false }
                      : m
                  )
                );
              }
              if (agentId) {
                onAgentStatusChange?.(agentId, "done");
              }
              // 스트리밍 완료 -> Preview 콜백 (메시지 흐름 변경 없음)
              if (onPreviewContent && activeAgentContentRef.current) {
                onPreviewContent(activeAgentContentRef.current);
                activeAgentContentRef.current = "";
              }
            }
          }

          if (event.type === "pipeline" && "nextAgent" in event) {
            const pipelineId = `pipeline-${Date.now()}`;
            setMessages((prev) => [
              ...prev,
              {
                id: pipelineId,
                role: "system" as const,
                content: event.pipelineMsg || "다음 단계로 진행할까요?",
                timestamp: new Date(),
                isPipeline: true,
                pipelineNext: {
                  nextAgent: event.nextAgent,
                  suggestion: event.pipelineMsg || "",
                },
              },
            ]);
          }

          if (event.type === "tool_use" && "toolName" in event && agentMsgId) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentMsgId
                  ? {
                      ...m,
                      toolUse: [
                        ...(m.toolUse ?? []),
                        { tool: event.toolName, input: event.toolInput ?? {}, status: "running" as const },
                      ],
                    }
                  : m
              )
            );
          }

          if (event.type === "tool_result" && "toolName" in event && agentMsgId) {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== agentMsgId) return m;
                const updatedToolUse = [...(m.toolUse ?? [])];
                for (let i = updatedToolUse.length - 1; i >= 0; i--) {
                  if (updatedToolUse[i].tool === event.toolName && updatedToolUse[i].status === "running") {
                    updatedToolUse[i] = { ...updatedToolUse[i], result: event.result, status: "done" as const };
                    break;
                  }
                }
                return { ...m, toolUse: updatedToolUse };
              })
            );
          }

          if (event.type === "error") {
            const errContent = `❌ 오류: ${"error" in event ? event.error : "알 수 없는 오류"}`;
            showErrorToast(errContent);
            setMessages((prev) => [
              ...prev,
              {
                id: `error-${Date.now()}`,
                role: "system" as const,
                content: errContent,
                timestamp: new Date(),
              },
            ]);
          }

          // ── 서버 측 에이전트 판단 불가 (클라이언트 사전 체크 통과 시 드물게 발생) ──
          if (event.type === "needs_agent_select") {
            setNeedsAgentSelect(text);
            ctrl.abort();
          }

          // ── Intent 라우팅 결과 수신 ────────────────────────────────────────
          // routing 이벤트는 stream 이벤트보다 먼저 도착 -> pendingRoutingRef에 저장
          if (event.type === "routing" && "targetAgent" in event) {
            const routingInfo: RoutingInfo = {
              method: event.method,
              targetAgent: event.targetAgent,
              matchedKeywords: event.matchedKeywords,
              reason: event.reason,
              gateReason: event.gateReason,
              originalAgent: event.originalAgent,
            };
            // 다음 stream 메시지 생성 시 첨부될 라우팅 정보 저장
            pendingRoutingRef.current = routingInfo;
            // 부모(page.tsx)에게 알림 -> RightPanel Timeline에 전달
            onRoutingEvent?.({ ...routingInfo, timestamp: Date.now() });
          }
        }
      }

      // 메시지 저장
      if (effectiveConvId) {
        await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: effectiveConvId, role: "user", content: text }),
        }).catch(() => {});
      }
      onConversationUpdate?.();
      onTeamAgentsClear?.();
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      const errContent = `❌ 오류: ${err instanceof Error ? err.message : "알 수 없는 오류"}`;
      showErrorToast(errContent);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "system" as const,
          content: errContent,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
      onLoadingChange?.(false);
      setMessages((prev) => prev.map((m) => m.isStreaming ? { ...m, isStreaming: false } : m));
      abortRef.current = null;
    }
  }, [isLoading, conversationId, targetAgent, externalTargetAgent, projectDefaultAgent, messages, onAutoNewConversation, onLoadingChange, onConversationUpdate, onTeamAgentsClear, onAgentStatusChange, onExternalTargetAgentClear, onPreviewContent, onRoutingEvent, onAutoTitleUpdate, setMessages, setTargetAgent, setNeedsAgentSelect, setInput]);

  return { isLoading, abortRef, handleSend };
}
