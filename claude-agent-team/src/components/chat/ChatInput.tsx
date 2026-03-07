"use client";

import { useRef } from "react";
import { AgentId } from "@/types";
import { AGENTS_CONFIG } from "@/config/agents";
import { T } from "@/lib/ui-tokens";
import FileUploadButton from "./FileUploadButton";
import FilePreviewBar from "./FilePreviewBar";
import type { FileAttachment } from "./useFileUpload";

// ─── Props ────────────────────────────────────────────────────────────────────

interface ChatInputProps {
  readonly input: string;
  readonly isLoading: boolean;
  readonly targetAgent: AgentId | null;
  readonly teamAgents: readonly AgentId[];
  readonly needsAgentSelect: string | null;
  readonly projectName?: string;
  readonly conversationTitle?: string;
  readonly maxMessageWidth: number;
  readonly onInputChange: (value: string) => void;
  readonly onSend: (overridePrompt?: string, overrideAgent?: AgentId) => void;
  readonly onTargetAgentChange: (agent: AgentId | null) => void;
  readonly onTeamAgentRemove: (id: AgentId) => void;
  readonly onNeedsAgentSelectClear: () => void;
  readonly onExternalTargetAgentClear?: () => void;
  /** 파일 첨부 관련 */
  readonly attachments?: readonly FileAttachment[];
  readonly onAddFiles?: (files: File[]) => void;
  readonly onRemoveFile?: (index: number) => void;
}

// ─── 에이전트 선택 UI (판단 불가 시) ──────────────────────────────────────────

function AgentSelectPanel({
  needsAgentSelect,
  maxMessageWidth,
  onSend,
  onClear,
}: {
  readonly needsAgentSelect: string;
  readonly maxMessageWidth: number;
  readonly onSend: (prompt: string, agent: AgentId) => void;
  readonly onClear: () => void;
}) {
  const agents = Object.values(AGENTS_CONFIG);
  return (
    <div
      style={{
        flexShrink: 0,
        borderTop: `1px solid ${T.border}`,
        padding: "12px 20px",
        background: "#1a1f2e",
      }}
    >
      <div style={{ maxWidth: maxMessageWidth, margin: "0 auto" }}>
        <div
          style={{
            background: "rgba(76,141,255,0.06)",
            border: "1px solid rgba(76,141,255,0.22)",
            borderRadius: 10,
            padding: "12px 16px",
          }}
        >
          <div style={{ fontSize: 12, color: T.text2, marginBottom: 10, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span>🤔</span>
            <span>어떤 에이전트에게 요청할까요?</span>
            <span
              style={{
                fontSize: 11, color: T.text3, background: T.card,
                border: `1px solid ${T.border}`, borderRadius: 6,
                padding: "1px 8px", fontFamily: "monospace",
                maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              &quot;{needsAgentSelect.slice(0, 60)}{needsAgentSelect.length > 60 ? "…" : ""}&quot;
            </span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => {
                  onClear();
                  onSend(needsAgentSelect, agent.id as AgentId);
                }}
                style={{
                  padding: "6px 12px", borderRadius: 20,
                  border: `1px solid ${agent.color}40`,
                  background: `${agent.color}12`,
                  color: "#E5E7EB", cursor: "pointer",
                  fontSize: 12, display: "flex", alignItems: "center", gap: 4,
                }}
              >
                <span style={{ fontSize: 14 }}>{agent.icon}</span>
                <span>{agent.name}</span>
              </button>
            ))}
            <button
              onClick={onClear}
              style={{
                padding: "6px 12px", borderRadius: 20,
                border: `1px solid ${T.border}`,
                background: "transparent",
                color: T.text3, cursor: "pointer", fontSize: 12,
              }}
            >
              취소
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ───────────────────────────────────────────────────────────

export function ChatInput({
  input,
  isLoading,
  targetAgent,
  teamAgents,
  needsAgentSelect,
  projectName,
  conversationTitle,
  maxMessageWidth,
  onInputChange,
  onSend,
  onTargetAgentChange,
  onTeamAgentRemove,
  onNeedsAgentSelectClear,
  onExternalTargetAgentClear,
  attachments = [],
  onAddFiles,
  onRemoveFile,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const agents = Object.values(AGENTS_CONFIG);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <>
      {/* ── 에이전트 선택 UI (판단 불가 시 표시) ── */}
      {needsAgentSelect && (
        <AgentSelectPanel
          needsAgentSelect={needsAgentSelect}
          maxMessageWidth={maxMessageWidth}
          onSend={(prompt, agent) => onSend(prompt, agent)}
          onClear={onNeedsAgentSelectClear}
        />
      )}

      {/* ── 입력 영역 ── */}
      <div style={{ flexShrink: 0, borderTop: `1px solid ${T.border}`, padding: "14px 20px 16px", background: T.card }}>
        <div style={{ maxWidth: maxMessageWidth, margin: "0 auto" }}>

          {/* 에이전트 선택 + 팀업 */}
          <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            {/* 타겟 에이전트 칩 */}
            {targetAgent && AGENTS_CONFIG[targetAgent] && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  background: `${AGENTS_CONFIG[targetAgent].color}15`,
                  border: `1px solid ${AGENTS_CONFIG[targetAgent].color}40`,
                  borderRadius: 20,
                  padding: "3px 8px 3px 6px",
                  fontSize: 11,
                  color: "#E5E7EB",
                }}
              >
                <span>{AGENTS_CONFIG[targetAgent].icon}</span>
                <span>{AGENTS_CONFIG[targetAgent].name}</span>
                <button
                  onClick={() => { onTargetAgentChange(null); onExternalTargetAgentClear?.(); }}
                  style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", padding: 0, marginLeft: 2, fontSize: 11 }}
                >
                  ✕
                </button>
              </div>
            )}

            {/* 팀업 에이전트 칩들 */}
            {teamAgents.map((id) => AGENTS_CONFIG[id] && (
              <div
                key={id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  background: `${AGENTS_CONFIG[id].color}15`,
                  border: `1px solid ${AGENTS_CONFIG[id].color}40`,
                  borderRadius: 20,
                  padding: "3px 8px 3px 6px",
                  fontSize: 11,
                  color: "#E5E7EB",
                }}
              >
                <span>{AGENTS_CONFIG[id].icon}</span>
                <span>{AGENTS_CONFIG[id].name}</span>
                <button
                  onClick={() => onTeamAgentRemove(id)}
                  style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", padding: 0, marginLeft: 2, fontSize: 11 }}
                >
                  ✕
                </button>
              </div>
            ))}

            {/* 에이전트 선택 버튼들 */}
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => onTargetAgentChange(targetAgent === agent.id ? null : agent.id as AgentId)}
                  title={agent.name}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 20,
                    border: `1px solid ${targetAgent === agent.id ? agent.color + "60" : "rgba(255,255,255,0.08)"}`,
                    background: targetAgent === agent.id ? `${agent.color}15` : "transparent",
                    color: targetAgent === agent.id ? "#E5E7EB" : "#6B7280",
                    cursor: "pointer",
                    fontSize: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span>{agent.icon}</span>
                  <span>{agent.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 입력창 + Context Path 통합 컨테이너 */}
          <div
            style={{
              background: T.bg,
              border: `1px solid ${T.border}`,
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {/* Context Path — 입력창 내부 상단 */}
            {(projectName || conversationTitle) && (
              <div style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "8px 14px 7px",
                fontSize: 12, color: T.text3,
                borderBottom: `1px solid ${T.border}`,
              }}>
                {projectName && (
                  <span style={{ color: T.text3, fontWeight: 500 }}>{projectName}</span>
                )}
                {projectName && conversationTitle && (
                  <span style={{ color: T.text3, margin: "0 2px", fontSize: 10 }}>›</span>
                )}
                {conversationTitle && (
                  <span style={{ color: T.text3, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {conversationTitle}
                  </span>
                )}
              </div>
            )}
            {/* 첨부 파일 미리보기 */}
            {onRemoveFile && (
              <FilePreviewBar attachments={attachments} onRemove={onRemoveFile} />
            )}
            {/* 입력 행 */}
            <div style={{ display: "flex", gap: 8, padding: "10px 12px", alignItems: "flex-end" }}>
              {/* 📎 파일 첨부 버튼 */}
              {onAddFiles && (
                <FileUploadButton onFiles={onAddFiles} disabled={isLoading} />
              )}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="메시지를 입력하세요... (Shift+Enter로 줄바꿈)"
                rows={1}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  color: T.text1,
                  fontSize: 14,
                  lineHeight: 1.5,
                  resize: "none",
                  outline: "none",
                  fontFamily: "inherit",
                  maxHeight: 120,
                  overflow: "auto",
                }}
                onInput={(e) => {
                  const el = e.target as HTMLTextAreaElement;
                  el.style.height = "auto";
                  el.style.height = Math.min(el.scrollHeight, 120) + "px";
                }}
              />
              <button
                onClick={() => onSend()}
                disabled={!input.trim() || isLoading}
                style={{
                  background: input.trim() && !isLoading ? "#8B5CF6" : "rgba(255,255,255,0.05)",
                  border: "none",
                  borderRadius: 8,
                  padding: "7px 16px",
                  color: input.trim() && !isLoading ? "#fff" : "#4B5563",
                  cursor: input.trim() && !isLoading ? "pointer" : "not-allowed",
                  fontSize: 14,
                  fontWeight: 600,
                  flexShrink: 0,
                  transition: "all 0.15s",
                }}
              >
                전송
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
