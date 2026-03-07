"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { AgentId } from "@/types";
import { AGENTS_CONFIG } from "@/config/agents";
import { T } from "@/lib/ui-tokens";
import { renderMarkdown } from "@/lib/utils/markdown";
import { SkeletonChatMessage } from "@/components/ui/Skeleton";
import { ChatMessageData, RoutingInfo, formatMsgTime, QUICK_START_CARDS, MESSAGES_PER_LOAD } from "./chat-types";

// ─── Props ────────────────────────────────────────────────────────────────────

interface ChatMessagesProps {
  readonly messages: readonly ChatMessageData[];
  readonly filteredMessages: readonly ChatMessageData[];
  readonly isMessagesLoading: boolean;
  readonly visibleCount: number;
  readonly searchQuery: string;
  readonly maxMessageWidth: number;
  readonly containerRef: React.RefObject<HTMLDivElement | null>;
  readonly messagesEndRef: React.RefObject<HTMLDivElement | null>;
  readonly isAtBottom: boolean;
  readonly conversationId: string | null;
  readonly onScroll: () => void;
  readonly onScrollToBottom: () => void;
  readonly onSend: (prompt?: string, agent?: AgentId) => void;
  readonly onLoadMore: () => void;
  readonly onPipelineApprove: (nextAgent: string) => void;
  readonly onEditMessage?: (messageIndex: number, content: string) => void;
  readonly onDeleteMessage?: (messageIndex: number) => void;
}

// ─── 메시지 액션 버튼 (hover 시 표시) ─────────────────────────────────────────

function MessageActions({
  canEdit,
  onEdit,
  onDelete,
}: {
  readonly canEdit: boolean;
  readonly onEdit?: () => void;
  readonly onDelete?: () => void;
}) {
  return (
    <div
      className="delete-btn"
      style={{
        display: "flex", gap: 2, position: "absolute", top: -8, right: 4,
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: 6, padding: "2px 4px", zIndex: 5,
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      }}
    >
      {canEdit && onEdit && (
        <button
          onClick={onEdit}
          title="편집"
          style={{
            background: "none", border: "none", cursor: "pointer",
            padding: "3px 6px", fontSize: 13, borderRadius: 4,
            color: "var(--text2)",
          }}
        >
          ✏️
        </button>
      )}
      {onDelete && (
        <button
          onClick={onDelete}
          title="삭제"
          style={{
            background: "none", border: "none", cursor: "pointer",
            padding: "3px 6px", fontSize: 13, borderRadius: 4,
            color: "var(--text2)",
          }}
        >
          🗑️
        </button>
      )}
    </div>
  );
}

// ─── 인라인 편집 모드 ─────────────────────────────────────────────────────────

function InlineEditor({
  content,
  onSave,
  onCancel,
}: {
  readonly content: string;
  readonly onSave: (newContent: string) => void;
  readonly onCancel: () => void;
}) {
  const [value, setValue] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    // 커서를 끝으로 이동
    if (textareaRef.current) {
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) onSave(value);
    }
    if (e.key === "Escape") onCancel();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: "80%" }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={Math.min(value.split("\n").length + 1, 8)}
        style={{
          width: "100%", resize: "vertical",
          background: "var(--bg)", color: "var(--text1)",
          border: "1px solid var(--accent)", borderRadius: 8,
          padding: "8px 12px", fontSize: 14,
          outline: "none", fontFamily: "inherit",
          minHeight: 40,
        }}
      />
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button
          onClick={onCancel}
          style={{
            padding: "4px 12px", fontSize: 12, borderRadius: 6,
            background: "var(--card)", border: "1px solid var(--border)",
            color: "var(--text2)", cursor: "pointer",
          }}
        >
          취소
        </button>
        <button
          onClick={() => value.trim() && onSave(value)}
          disabled={!value.trim()}
          style={{
            padding: "4px 12px", fontSize: 12, borderRadius: 6,
            background: "var(--accent)", border: "none",
            color: "#fff", cursor: value.trim() ? "pointer" : "not-allowed",
            opacity: value.trim() ? 1 : 0.5,
          }}
        >
          저장
        </button>
      </div>
    </div>
  );
}

// ─── 삭제 확인 다이얼로그 ─────────────────────────────────────────────────────

function DeleteConfirm({
  onConfirm,
  onCancel,
}: {
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "6px 10px",
      background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
      borderRadius: 6, fontSize: 12,
    }}>
      <span style={{ color: "var(--error)" }}>삭제하시겠습니까?</span>
      <button
        onClick={onConfirm}
        style={{
          padding: "2px 10px", fontSize: 11, borderRadius: 4,
          background: "var(--error)", border: "none",
          color: "#fff", cursor: "pointer",
        }}
      >
        삭제
      </button>
      <button
        onClick={onCancel}
        style={{
          padding: "2px 10px", fontSize: 11, borderRadius: 4,
          background: "var(--card)", border: "1px solid var(--border)",
          color: "var(--text2)", cursor: "pointer",
        }}
      >
        취소
      </button>
    </div>
  );
}

// ─── 사용자 메시지 버블 ───────────────────────────────────────────────────────

function UserBubble({
  msg,
  messageIndex,
  onEdit,
  onDelete,
}: {
  readonly msg: ChatMessageData;
  readonly messageIndex: number;
  readonly onEdit?: (messageIndex: number, content: string) => void;
  readonly onDelete?: (messageIndex: number) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSave = (newContent: string) => {
    onEdit?.(messageIndex, newContent);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <InlineEditor
          content={msg.content}
          onSave={handleSave}
          onCancel={() => setIsEditing(false)}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <div style={{ maxWidth: "80%", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, position: "relative" }}>
        {(onEdit || onDelete) && (
          <MessageActions
            canEdit={true}
            onEdit={() => setIsEditing(true)}
            onDelete={() => setIsDeleting(true)}
          />
        )}
        {isDeleting ? (
          <DeleteConfirm
            onConfirm={() => { onDelete?.(messageIndex); setIsDeleting(false); }}
            onCancel={() => setIsDeleting(false)}
          />
        ) : (
          <div
            style={{
              background: "rgba(139,92,246,0.18)",
              border: "1px solid rgba(139,92,246,0.28)",
              borderRadius: "12px 12px 2px 12px",
              padding: "10px 16px",
              fontSize: 14,
              color: "var(--text1)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {msg.content}
          </div>
        )}
        <span style={{ fontSize: 11, color: T.text3, fontFamily: "monospace", letterSpacing: "0.02em" }}>
          {formatMsgTime(msg.timestamp)}
        </span>
      </div>
    </div>
  );
}

// ─── 파이프라인 카드 ──────────────────────────────────────────────────────────

function PipelineCard({ msg, onApprove }: { readonly msg: ChatMessageData; readonly onApprove: (nextAgent: string) => void }) {
  return (
    <div
      style={{
        background: "rgba(139,92,246,0.08)",
        border: "1px solid rgba(139,92,246,0.2)",
        borderRadius: 10,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, color: "#C4B5FD" }}>{msg.content}</span>
        <span style={{ fontSize: 11, color: T.text3, fontFamily: "monospace" }}>{formatMsgTime(msg.timestamp)}</span>
      </div>
      <button
        onClick={() => msg.pipelineNext && onApprove(msg.pipelineNext.nextAgent)}
        style={{
          padding: "5px 14px",
          borderRadius: 6, border: "none",
          background: "#8B5CF6", color: "#fff",
          cursor: "pointer", fontSize: 12, fontWeight: 600, flexShrink: 0,
        }}
      >
        승인 →
      </button>
    </div>
  );
}

// ─── 시스템/에러 메시지 ───────────────────────────────────────────────────────

function SystemMessage({ msg }: { readonly msg: ChatMessageData }) {
  const isError = msg.content.startsWith("❌") || msg.content.includes("오류:");
  return (
    <div style={{
      display: "flex", alignItems: "baseline", gap: 8,
      padding: "6px 12px",
      background: isError ? "#EF44440D" : "rgba(255,255,255,0.025)",
      border: `1px solid ${isError ? "#EF444430" : T.border}`,
      borderLeft: `3px solid ${isError ? "#EF4444" : T.border}`,
      borderRadius: 6,
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    }}>
      <span style={{ fontSize: 10, color: isError ? "#EF444480" : T.text3, flexShrink: 0, letterSpacing: "0.02em" }}>
        {formatMsgTime(msg.timestamp)}
      </span>
      <span style={{
        fontSize: 9, fontWeight: 700, flexShrink: 0,
        color: isError ? "#EF4444" : T.text3,
        background: isError ? "#EF444420" : `${T.border}60`,
        border: `1px solid ${isError ? "#EF444440" : T.border}`,
        borderRadius: 3, padding: "0px 5px", lineHeight: 1.6,
      }}>
        {isError ? "ERROR" : "SYS"}
      </span>
      <span style={{
        fontSize: 13, lineHeight: 1.6,
        color: isError ? "#FCA5A5" : T.text3,
        wordBreak: "break-word",
      }}>
        {msg.content}
      </span>
    </div>
  );
}

// ─── 라우팅 배지 ──────────────────────────────────────────────────────────────

function RoutingBadge({ routing }: { readonly routing: RoutingInfo }) {
  if (routing.method === "explicit") return null;
  return (
    <span
      title={routing.gateReason ?? routing.reason}
      style={{
        fontSize: 9,
        padding: "1px 6px",
        borderRadius: 4,
        fontFamily: "monospace",
        cursor: "default",
        background: routing.method === "gate"
          ? "rgba(245,158,11,0.12)"
          : routing.method === "keyword"
          ? "rgba(139,92,246,0.12)"
          : "rgba(107,114,128,0.10)",
        color: routing.method === "gate"
          ? "#F59E0B"
          : routing.method === "keyword"
          ? "#8B5CF6"
          : T.text3,
        border: `1px solid ${
          routing.method === "gate"
            ? "rgba(245,158,11,0.30)"
            : routing.method === "keyword"
            ? "rgba(139,92,246,0.30)"
            : T.border
        }`,
      }}
    >
      {routing.method === "gate"
        ? `⚠ ${routing.originalAgent}→${routing.targetAgent}`
        : routing.method === "keyword"
        ? `⌗ ${routing.matchedKeywords?.slice(0, 2).join(", ") ?? "keyword"}`
        : "Auto"}
    </span>
  );
}

// ─── 에이전트 메시지 ──────────────────────────────────────────────────────────

function AgentMessage({
  msg,
  messageIndex,
  onDelete,
}: {
  readonly msg: ChatMessageData;
  readonly messageIndex: number;
  readonly onDelete?: (messageIndex: number) => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const agentConfig = msg.agentId ? AGENTS_CONFIG[msg.agentId as AgentId] : undefined;

  return (
    <div style={{
      background: agentConfig
        ? `${agentConfig.color}07`
        : "rgba(255,255,255,0.02)",
      border: `1px solid ${agentConfig
        ? `${agentConfig.color}15`
        : T.border}`,
      borderRadius: 10,
      padding: "10px 14px",
      position: "relative",
    }}>
      {onDelete && !msg.isStreaming && (
        <MessageActions
          canEdit={false}
          onDelete={() => setIsDeleting(true)}
        />
      )}
      {isDeleting && (
        <div style={{ marginBottom: 8 }}>
          <DeleteConfirm
            onConfirm={() => { onDelete?.(messageIndex); setIsDeleting(false); }}
            onCancel={() => setIsDeleting(false)}
          />
        </div>
      )}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        {agentConfig && (
          <div
            style={{
              width: 28, height: 28, borderRadius: "50%",
              background: `${agentConfig.color}20`,
              border: `1px solid ${agentConfig.color}40`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, flexShrink: 0, marginTop: 2,
            }}
          >
            {agentConfig.icon}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* 에이전트 이름 + 타임스탬프 + 라우팅 배지 */}
          {agentConfig && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: agentConfig.color, fontWeight: 600 }}>
                {agentConfig.name}
              </span>
              <span style={{ fontSize: 11, color: T.text3, fontFamily: "monospace", letterSpacing: "0.02em" }}>
                {formatMsgTime(msg.timestamp)}
              </span>
              {msg.routing && <RoutingBadge routing={msg.routing} />}
            </div>
          )}
          {/* Tool use 진행 표시 — 스트리밍 중에만 표시, 완료 후 숨김 */}
          {msg.isStreaming && msg.toolUse && msg.toolUse.length > 0 && (() => {
            const runningTools = msg.toolUse.filter((t) => t.status === "running");
            const doneCount = msg.toolUse.filter((t) => t.status === "done").length;
            const lastRunning = runningTools[runningTools.length - 1];
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--text3)", padding: "3px 0", marginBottom: 4 }}>
                <span style={{ animation: "spin 1.5s linear infinite", fontSize: 10, color: "var(--pending)" }}>⚙️</span>
                {lastRunning ? (
                  <span style={{ color: "var(--pending)", fontFamily: "monospace" }}>{lastRunning.tool}</span>
                ) : null}
                {doneCount > 0 && (
                  <span style={{ color: "var(--text3)" }}>({doneCount}개 완료)</span>
                )}
              </div>
            );
          })()}
          {/* 스트리밍 중이고 콘텐츠가 없으면 "생각하는 중..." 표시 */}
          {msg.isStreaming && !msg.content && (
            <div style={{ color: "var(--text3)", fontSize: 12, fontStyle: "italic", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ animation: "pulse 1.5s ease-in-out infinite" }}>●</span>
              <span>생각하는 중...</span>
            </div>
          )}
          {/* 마크다운 렌더링 (HTML) */}
          {msg.content && (
            <div
              className={`markdown-body ${msg.isStreaming && msg.content ? "streaming-cursor" : ""}`}
              style={{ fontSize: 14, color: "var(--text1)", wordBreak: "break-word", lineHeight: 1.65 }}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Quick Start 카드 (빈 상태) ──────────────────────────────────────────────

function QuickStartCards({ onSend }: { readonly onSend: (prompt: string) => void }) {
  return (
    <div style={{ padding: "40px 0 24px", textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>🤖</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text1)", marginBottom: 4 }}>
        JM Agent Team
      </div>
      <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 32 }}>
        무엇을 도와드릴까요?
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
        {QUICK_START_CARDS.map((card) => (
          <button
            key={card.title}
            onClick={() => onSend(card.prompt)}
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 10,
              padding: "14px 16px",
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.15s",
            }}
          >
            <div style={{ fontSize: 20, marginBottom: 6 }}>{card.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)", marginBottom: 4 }}>{card.title}</div>
            <div style={{ fontSize: 11, color: "var(--text3)" }}>{card.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ───────────────────────────────────────────────────────────

export function ChatMessages({
  messages,
  filteredMessages,
  isMessagesLoading,
  visibleCount,
  searchQuery,
  maxMessageWidth,
  containerRef,
  messagesEndRef,
  isAtBottom,
  conversationId,
  onScroll,
  onScrollToBottom,
  onSend,
  onLoadMore,
  onPipelineApprove,
  onEditMessage,
  onDeleteMessage,
}: ChatMessagesProps) {
  const displayMessages = useMemo(() => {
    if (searchQuery.trim()) {
      return filteredMessages.filter((m) => m.content.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return filteredMessages.slice(-visibleCount);
  }, [filteredMessages, searchQuery, visibleCount]);

  // filteredMessages 내 인덱스를 전체 messages 배열 인덱스로 매핑
  const getOriginalIndex = (msg: ChatMessageData): number => {
    return messages.findIndex((m) => m.id === msg.id);
  };

  return (
    <div style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div ref={containerRef} onScroll={onScroll} style={{ flex: 1, overflowY: "auto", padding: "16px 0" }}>
        <div style={{ maxWidth: Math.min(maxMessageWidth ?? 1200, 1200), margin: "0 auto", width: "100%", padding: "0 24px", boxSizing: "border-box" }}>

          {/* 메시지 로딩 스켈레톤 */}
          {isMessagesLoading && (
            <div style={{ padding: "24px 0" }}>
              {Array.from({ length: 3 }, (_, i) => (
                <SkeletonChatMessage key={i} />
              ))}
            </div>
          )}

          {/* 빈 상태 - Quick Start 카드 */}
          {!isMessagesLoading && messages.length === 0 && (
            <QuickStartCards onSend={(prompt) => onSend(prompt)} />
          )}

          {/* 메시지 목록 */}
          {displayMessages.map((msg) => {
            const originalIndex = getOriginalIndex(msg);
            return (
              <div key={msg.id} style={{ marginBottom: 16 }}>
                {msg.role === "user" ? (
                  <UserBubble
                    msg={msg}
                    messageIndex={originalIndex}
                    onEdit={conversationId ? onEditMessage : undefined}
                    onDelete={conversationId ? onDeleteMessage : undefined}
                  />
                ) : msg.isPipeline ? (
                  <PipelineCard msg={msg} onApprove={onPipelineApprove} />
                ) : msg.role === "system" ? (
                  <SystemMessage msg={msg} />
                ) : (
                  <AgentMessage
                    msg={msg}
                    messageIndex={originalIndex}
                    onDelete={conversationId ? onDeleteMessage : undefined}
                  />
                )}
              </div>
            );
          })}

          {messages.length > visibleCount && (
            <button
              onClick={onLoadMore}
              style={{
                display: "block",
                width: "100%",
                padding: "8px",
                marginBottom: 12,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8,
                color: "var(--text3)",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              이전 메시지 더 보기...
            </button>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ↓ 최신 메시지로 이동 버튼 — 위로 스크롤 시 표시 */}
      {!isAtBottom && (
        <button
          onClick={onScrollToBottom}
          style={{
            position: "absolute",
            bottom: 16,
            right: 24,
            background: T.accent,
            color: "#fff",
            border: "none",
            borderRadius: 20,
            padding: "6px 14px 6px 10px",
            fontSize: 12,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
            zIndex: 10,
          }}
        >
          ↓ 최신 메시지
        </button>
      )}
    </div>
  );
}
