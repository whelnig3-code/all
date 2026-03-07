"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { AgentId, AgentStatus } from "@/types";
import { AGENTS_CONFIG } from "@/config/agents";
import { T } from "@/lib/ui-tokens";
import { ChatMessageData, RoutingInfo, MESSAGES_PER_LOAD } from "./chat-types";
import { useChatStream } from "./useChatStream";
import { ChatMessages } from "./ChatMessages";
import { ChatInput } from "./ChatInput";

// ─── Props ────────────────────────────────────────────────────────────────────

interface ChatAreaProps {
  projectName?: string;
  conversationTitle?: string;  // Context Path 표시용 대화 제목
  conversationId: string | null;
  onConversationUpdate?: () => void;
  onAgentStatusChange?: (agentId: string, status: AgentStatus, currentTask?: string) => void;
  onAutoNewConversation?: () => Promise<string>;
  externalTargetAgent?: string | null;
  onExternalTargetAgentClear?: () => void;
  initialTeamAgents?: string[] | null;
  onTeamAgentsClear?: () => void;
  onLoadingChange?: (loading: boolean) => void;
  maxMessageWidth?: number;
  onAutoTitleUpdate?: (conversationId: string, firstMessage: string) => void;
  onSessionStatsChange?: (stats: { userCount: number; agentCount: number; toolCount: number; firstTask?: string }) => void;
  onPreviewContent?: (content: string) => void;  // 에이전트 응답 완료 시 Preview 패널 업데이트
  /** 라우팅 이벤트 → 부모(page.tsx)가 RightPanel Timeline에 전달 */
  onRoutingEvent?: (event: RoutingInfo & { timestamp: number }) => void;
  /** 프로젝트 기본 에이전트 — targetAgent 미지정 + inferIntent 실패 시 사용 */
  projectDefaultAgent?: AgentId;
}

// ─── 메인 컴포넌트 ───────────────────────────────────────────────────────────

export default function ChatArea({
  projectName,
  conversationTitle,
  conversationId,
  onConversationUpdate,
  onAgentStatusChange,
  onAutoNewConversation,
  externalTargetAgent,
  onExternalTargetAgentClear,
  initialTeamAgents,
  onTeamAgentsClear,
  onLoadingChange,
  maxMessageWidth = 860,
  onAutoTitleUpdate,
  onSessionStatsChange,
  onPreviewContent,
  onRoutingEvent,
  projectDefaultAgent,
}: ChatAreaProps) {
  // ── 상태 ──────────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [input, setInput] = useState("");
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [targetAgent, setTargetAgent] = useState<AgentId | null>(null);
  const [needsAgentSelect, setNeedsAgentSelect] = useState<string | null>(null);
  const [teamAgents, setTeamAgents] = useState<AgentId[]>([]);
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [visibleCount, setVisibleCount] = useState(MESSAGES_PER_LOAD);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [agentFilter, setAgentFilter] = useState<string | null>(null);

  // ── Refs ────────────────────────────────────────────────────────────────
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // ── 스마트 자동 스크롤 ───────────────────────────────────────────────────
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const atBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 50;
    isAtBottomRef.current = atBottom;
    setIsAtBottom(atBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    isAtBottomRef.current = true;
    setIsAtBottom(true);
  }, []);

  // ── SSE 스트리밍 Hook ──────────────────────────────────────────────────
  const { isLoading, abortRef, handleSend: streamSend } = useChatStream({
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
  });

  // ── handleSend 래퍼 (input 상태 통합) ──────────────────────────────────
  const handleSend = useCallback(
    async (overridePrompt?: string, overrideAgent?: AgentId) => {
      const text = overridePrompt ?? input;
      if (!text.trim()) return;

      // 사용자가 직접 메시지를 보낼 때는 항상 맨 아래로 복원
      isAtBottomRef.current = true;
      setIsAtBottom(true);

      if (!overridePrompt) setInput("");

      // 사용자 메시지 즉시 추가
      const userMsgId = `user-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: "user", content: text.trim(), timestamp: new Date() },
      ]);

      await streamSend(text, overrideAgent);
    },
    [input, streamSend],
  );

  const handlePipelineApprove = useCallback(
    (nextAgent: string) => {
      handleSend("승인 - 다음 단계 진행해줘", nextAgent as AgentId);
    },
    [handleSend],
  );

  // ── 메시지 편집/삭제 핸들러 ──────────────────────────────────────────────
  const handleEditMessage = useCallback(
    async (messageIndex: number, content: string) => {
      if (!conversationId) return;
      try {
        const res = await fetch("/api/messages", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, messageIndex, content }),
        });
        if (res.ok) {
          setMessages((prev) =>
            prev.map((m, i) => (i === messageIndex ? { ...m, content } : m)),
          );
        }
      } catch { /* ignore */ }
    },
    [conversationId],
  );

  const handleDeleteMessage = useCallback(
    async (messageIndex: number) => {
      if (!conversationId) return;
      try {
        const res = await fetch("/api/messages", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, messageIndex }),
        });
        if (res.ok) {
          setMessages((prev) => prev.filter((_, i) => i !== messageIndex));
        }
      } catch { /* ignore */ }
    },
    [conversationId],
  );

  // ── 외부 Props 동기화 Effects ──────────────────────────────────────────
  useEffect(() => {
    if (initialTeamAgents && initialTeamAgents.length > 0) {
      setTeamAgents(initialTeamAgents as AgentId[]);
      setShowTeamPicker(true);
    }
  }, [initialTeamAgents]);

  useEffect(() => {
    if (externalTargetAgent) {
      setTargetAgent(externalTargetAgent as AgentId);
    }
  }, [externalTargetAgent]);

  // conversationId 변경 시 메시지 로드
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setIsMessagesLoading(false);
      return;
    }
    setIsMessagesLoading(true);
    fetch(`/api/messages?conversationId=${conversationId}`)
      .then((r) => r.json())
      .then((data) => {
        const msgs = (data.messages ?? []).map((m: { role: string; content: string; agentId?: string }, i: number) => ({
          id: `loaded-${i}`,
          role: m.role === "user" ? "user" : "agent",
          content: m.content,
          agentId: m.agentId,
          timestamp: new Date(),
        }));
        setMessages(msgs);
      })
      .catch(() => {})
      .finally(() => setIsMessagesLoading(false));
  }, [conversationId]);

  // 새 메시지 → 맨 아래에 있을 때만 자동 스크롤
  useEffect(() => {
    if (isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // ── 파생 상태 (Memoized) ──────────────────────────────────────────────
  const agentsWithMessages = useMemo(() => {
    const ids = new Set(messages.filter((m) => m.agentId).map((m) => m.agentId!));
    return Array.from(ids)
      .map((id) => AGENTS_CONFIG[id as AgentId])
      .filter(Boolean);
  }, [messages]);

  const sessionStats = useMemo(() => {
    const userCount = messages.filter((m) => m.role === "user").length;
    const agentIds = new Set(messages.filter((m) => m.agentId).map((m) => m.agentId!));
    const firstMsg = messages.find((m) => m.role === "user");
    const toolCount = messages.reduce((acc, m) => acc + (m.toolUse?.length ?? 0), 0);
    return { userCount, agentCount: agentIds.size, firstMsg, toolCount };
  }, [messages]);

  const filteredMessages = useMemo(() => {
    if (!agentFilter) return messages;
    return messages.filter((m) => m.agentId === agentFilter || m.role === "user");
  }, [messages, agentFilter]);

  useEffect(() => {
    onSessionStatsChange?.(sessionStats);
  }, [sessionStats, onSessionStatsChange]);

  // ── 렌더링 ──────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: T.bg }}>
      {/* ── 헤더 ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 20px",
          borderBottom: `1px solid ${T.border}`,
          background: T.card,
          flexShrink: 0,
        }}
      >
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.active, boxShadow: `0 0 8px ${T.active}60` }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: T.text1 }}>
          {projectName ?? "JM Agent Team"}
        </span>
        {isLoading && (
          <span style={{ fontSize: 11, color: T.pending, background: `${T.pending}18`, padding: "2px 8px", borderRadius: 10 }}>
            에이전트 처리 중...
          </span>
        )}
        {isLoading && (
          <button
            onClick={() => abortRef.current?.abort()}
            style={{ marginLeft: "auto", fontSize: 11, color: T.error, background: `${T.error}18`, border: `1px solid ${T.error}30`, borderRadius: 6, padding: "3px 10px", cursor: "pointer" }}
          >
            중단
          </button>
        )}
        {/* 에이전트 필터 탭 */}
        {messages.length > 0 && agentsWithMessages.length > 0 && (
          <div style={{ display: "flex", gap: 4, alignItems: "center", marginLeft: 8 }}>
            <button
              onClick={() => setAgentFilter(null)}
              style={{
                fontSize: 11, padding: "2px 10px", borderRadius: 20,
                border: `1px solid ${agentFilter === null ? "rgba(139,92,246,0.5)" : "rgba(255,255,255,0.08)"}`,
                background: agentFilter === null ? "rgba(139,92,246,0.15)" : "transparent",
                color: agentFilter === null ? "#C4B5FD" : "#6B7280", cursor: "pointer",
              }}
            >
              전체
            </button>
            {agentsWithMessages.map((agent) => (
              <button
                key={agent.id}
                onClick={() => setAgentFilter((prev) => prev === agent.id ? null : agent.id)}
                style={{
                  fontSize: 11, padding: "2px 10px", borderRadius: 20,
                  border: `1px solid ${agentFilter === agent.id ? agent.color + "60" : "rgba(255,255,255,0.08)"}`,
                  background: agentFilter === agent.id ? `${agent.color}18` : "transparent",
                  color: agentFilter === agent.id ? "#E5E7EB" : "#6B7280",
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 3,
                }}
              >
                <span style={{ fontSize: 12 }}>{agent.icon}</span>
                <span>{agent.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* 검색 + 내보내기 버튼 */}
        {!isLoading && messages.length > 0 && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button
              onClick={() => setShowSearch((s) => !s)}
              title="대화 검색"
              style={{ fontSize: 14, background: showSearch ? "rgba(139,92,246,0.2)" : "none", border: "none", color: showSearch ? "#A78BFA" : "#6B7280", cursor: "pointer", padding: "3px 8px", borderRadius: 6 }}
            >
              🔍
            </button>
            <button
              onClick={() => {
                const md = messages.map((m) =>
                  `### ${m.role === "user" ? "👤 사용자" : `🤖 ${m.agentId ?? "에이전트"}`}\n\n${m.content}`
                ).join("\n\n---\n\n");
                const blob = new Blob([md], { type: "text/markdown" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `conversation-${conversationId?.slice(0, 8) ?? "export"}.md`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              title="Markdown으로 내보내기"
              style={{ fontSize: 14, background: "none", border: "none", color: "#6B7280", cursor: "pointer", padding: "3px 8px", borderRadius: 6 }}
            >
              ↓
            </button>
          </div>
        )}
      </div>

      {/* ── 세션 요약 바 ── */}
      {messages.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "5px 20px",
            borderBottom: `1px solid ${T.border}`,
            background: T.bg,
            fontSize: 11,
            color: T.text3,
            flexShrink: 0,
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span>💬</span>
            <span style={{ color: T.text2 }}>{sessionStats.userCount}개 요청</span>
          </span>
          {sessionStats.agentCount > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span>🤖</span>
              <span style={{ color: T.text2 }}>{sessionStats.agentCount}개 에이전트</span>
            </span>
          )}
          {sessionStats.toolCount > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span>⚙️</span>
              <span style={{ color: T.text2 }}>{sessionStats.toolCount}개 도구 사용</span>
            </span>
          )}
          {agentFilter && (
            <span
              style={{
                color: "#A78BFA",
                background: "rgba(139,92,246,0.1)",
                padding: "1px 8px",
                borderRadius: 10,
                border: "1px solid rgba(139,92,246,0.2)",
              }}
            >
              {AGENTS_CONFIG[agentFilter as AgentId]?.icon} {AGENTS_CONFIG[agentFilter as AgentId]?.name} 필터 적용
            </span>
          )}
          {sessionStats.firstMsg && (
            <span
              style={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: T.text3,
              }}
            >
              📋 {sessionStats.firstMsg.content.slice(0, 80)}
            </span>
          )}
        </div>
      )}

      {/* 검색 바 */}
      {showSearch && (
        <div style={{ padding: "8px 20px", borderBottom: `1px solid ${T.border}`, background: T.bg }}>
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="메시지 검색..."
            style={{
              width: "100%", padding: "6px 12px", background: T.card,
              border: `1px solid ${T.border}`, borderRadius: 8,
              color: T.text1, fontSize: 13, outline: "none", boxSizing: "border-box",
            }}
          />
        </div>
      )}

      {/* ── 메시지 영역 ── */}
      <ChatMessages
        messages={messages}
        filteredMessages={filteredMessages}
        isMessagesLoading={isMessagesLoading}
        visibleCount={visibleCount}
        searchQuery={searchQuery}
        maxMessageWidth={maxMessageWidth}
        containerRef={containerRef}
        messagesEndRef={messagesEndRef}
        isAtBottom={isAtBottom}
        conversationId={conversationId}
        onScroll={handleScroll}
        onScrollToBottom={scrollToBottom}
        onSend={handleSend}
        onLoadMore={() => setVisibleCount((c) => c + MESSAGES_PER_LOAD)}
        onPipelineApprove={handlePipelineApprove}
        onEditMessage={handleEditMessage}
        onDeleteMessage={handleDeleteMessage}
      />

      {/* ── 입력 영역 ── */}
      <ChatInput
        input={input}
        isLoading={isLoading}
        targetAgent={targetAgent}
        teamAgents={teamAgents}
        needsAgentSelect={needsAgentSelect}
        projectName={projectName}
        conversationTitle={conversationTitle}
        maxMessageWidth={maxMessageWidth}
        onInputChange={setInput}
        onSend={handleSend}
        onTargetAgentChange={setTargetAgent}
        onTeamAgentRemove={(id) => setTeamAgents((prev) => prev.filter((a) => a !== id))}
        onNeedsAgentSelectClear={() => setNeedsAgentSelect(null)}
        onExternalTargetAgentClear={onExternalTargetAgentClear}
      />
    </div>
  );
}
