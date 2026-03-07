"use client";

import { Agent, ConnectionStatus } from "@/types";
import { T } from "@/lib/ui-tokens";

interface AgentBarProps {
  agents: Agent[];
  connectionStatus?: ConnectionStatus;
  isProcessing?: boolean;
  /** 모바일 컴팩트 모드: 작은 칩 + 이름 숨김 */
  compact?: boolean;
}

export default function AgentBar({ agents, connectionStatus, isProcessing, compact = false }: AgentBarProps) {
  const activeCount = agents.filter((a) => a.status === "active").length;

  const connectionIndicator = (() => {
    switch (connectionStatus) {
      case "connected":
        return { color: T.active,  glow: `0 0 6px ${T.active}80`,  label: "실시간 연결" };
      case "connecting":
        return { color: T.pending, glow: `0 0 6px ${T.pending}80`, label: "연결 중..." };
      case "disconnected":
      case "error":
        return { color: T.error,   glow: "none",                    label: "폴링 모드" };
      default:
        return null;
    }
  })();

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: compact ? 4 : 6,
      padding: compact ? "4px 8px" : "6px 16px",
      background: T.card,
      borderBottom: `1px solid ${T.border}`,
      overflowX: "auto",
      flexShrink: 0,
      minHeight: compact ? 40 : 52,
      WebkitOverflowScrolling: "touch" as never,
    }}>
      {/* 섹션 레이블 */}
      <span style={{
        fontSize: 10, color: T.text3, fontWeight: 700,
        marginRight: 6, flexShrink: 0,
        letterSpacing: "0.06em", textTransform: "uppercase",
      }}>
        에이전트
      </span>

      {/* 에이전트 칩 목록 */}
      {agents.map((agent) => {
        const isActive = agent.status === "active";
        const isDone   = agent.status === "done";
        const isError  = agent.status === "error";
        const chipColor   = isActive ? agent.color : isDone ? agent.color + "80" : "rgba(255,255,255,0.04)";
        const borderColor = isActive ? agent.color + "60" : isDone ? agent.color + "30" : T.border;

        return (
          <div
            key={agent.id}
            title={compact ? `${agent.name}: ${agent.description}` : agent.description}
            className={isActive ? "agent-chip-active" : ""}
            style={{
              display: "flex", flexDirection: "column", alignItems: "flex-start",
              gap: 1, padding: compact ? "3px 6px" : "4px 10px",
              borderRadius: 20,
              background: chipColor,
              border: `1px solid ${borderColor}`,
              cursor: "default", flexShrink: 0,
              transition: "all 0.2s", minWidth: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: compact ? 3 : 5 }}>
              <span style={{ fontSize: compact ? 11 : 12 }}>{agent.icon}</span>
              {!compact && (
                <span style={{
                  fontSize: 12, fontWeight: isActive ? 600 : 400,
                  color: isActive ? T.text1 : isDone ? T.text2 : T.text3,
                }}>
                  {agent.name}
                </span>
              )}
              {/* 상태 점 */}
              <div style={{
                width: 5, height: 5, borderRadius: "50%",
                background: isActive ? T.active : isError ? T.error : isDone ? T.accent : "#374151",
                boxShadow: isActive
                  ? `0 0 6px ${T.active}, 0 0 0 2px ${T.active}33`
                  : isError ? `0 0 4px ${T.error}80` : "none",
                animation: isActive ? "pulse-glow 2s ease-in-out infinite" : "none",
              }} />
            </div>
            {/* 현재 작업 (active 시, 데스크톱만) */}
            {!compact && isActive && agent.currentTask && (
              <div style={{
                fontSize: 9, color: T.text2,
                maxWidth: 130, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap",
                paddingLeft: 17, lineHeight: 1.2,
              }}>
                {agent.currentTask}
              </div>
            )}
            {/* 완료 표시 (데스크톱만) */}
            {!compact && isDone && (
              <div style={{ fontSize: 9, color: T.accent, paddingLeft: 17, lineHeight: 1.2 }}>
                완료
              </div>
            )}
          </div>
        );
      })}

      {/* 오른쪽: 처리 중 인디케이터 + 연결 상태 */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {/* 처리 중 인디케이터 */}
        {isProcessing && activeCount === 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "3px 10px", borderRadius: 12,
            background: `${T.accent}18`, border: `1px solid ${T.border}`,
            fontSize: 10, fontWeight: 600, color: T.accent, flexShrink: 0,
          }}>
            <span style={{ animation: "pulse 1.5s ease-in-out infinite" }}>⏳</span>
            호출 중...
          </div>
        )}

        {/* WebSocket 연결 상태 */}
        {connectionIndicator && (
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "3px 10px", borderRadius: 12,
            background: T.card, border: `1px solid ${T.border}`,
            flexShrink: 0,
          }}>
            <div style={{
              width: 5, height: 5, borderRadius: "50%",
              background: connectionIndicator.color,
              boxShadow: connectionIndicator.glow,
              animation: connectionStatus === "connecting" ? "pulse 1.5s ease-in-out infinite" : "none",
            }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: connectionIndicator.color }}>
              {connectionIndicator.label}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
