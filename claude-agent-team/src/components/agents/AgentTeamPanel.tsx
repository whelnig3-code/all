"use client";

import { Agent } from "@/types";
import { useState, useRef, useEffect } from "react";
import { T } from "@/lib/ui-tokens";
import { SkeletonAgentRow } from "@/components/ui/Skeleton";
import CustomAgentForm from "./CustomAgentForm";

interface AgentTeamPanelProps {
  agents: Agent[];
  onRunWorkflow: (agentIds: string[]) => void;
  onSelectAgent?: (agentId: string) => void;   // 기존: 채팅탭으로 이동
  onAgentSelect?: (agentId: string | null) => void; // 신규: 우측 패널로 선택 전달
  selectedAgentId?: string | null;             // 부모가 내려주는 선택 상태
  isLoading?: boolean;                         // 에이전트 목록 로딩 중
  onCustomAgentCreated?: () => void;           // 커스텀 에이전트 생성/삭제 후 새로고침
}

// 미리 정의된 워크플로우 프리셋
const WORKFLOW_PRESETS = [
  { id: "dev",    name: "기능 개발",      icon: "🏗️", agents: ["planner", "developer", "reviewer"],                            color: "#3B82F6" },
  { id: "secure", name: "보안 감사",      icon: "🔒", agents: ["security-auditor", "reviewer"],                                color: "#EF4444" },
  { id: "docs",   name: "문서화",         icon: "📝", agents: ["researcher", "writer"],                                        color: "#F59E0B" },
  { id: "design", name: "UI 개발",        icon: "🎨", agents: ["designer", "developer", "reviewer"],                           color: "#EC4899" },
  { id: "full",   name: "전체 파이프라인", icon: "⚡", agents: ["planner", "developer", "reviewer", "security-auditor", "writer"], color: "#8B5CF6" },
];

type StatusFilter = "all" | "active" | "done" | "error" | "idle";

const STATUS_PILLS: { key: StatusFilter; label: string; color: string }[] = [
  { key: "all",    label: "All",    color: T.text2 },
  { key: "active", label: "Active", color: T.active },
  { key: "done",   label: "Done",   color: T.accent },
  { key: "error",  label: "Error",  color: T.error },
  { key: "idle",   label: "Idle",   color: T.text3 },
];

function getStatusColor(status: Agent["status"]) {
  if (status === "active") return T.active;
  if (status === "error")  return T.error;
  if (status === "done")   return T.accent;
  return T.border;
}

export default function AgentTeamPanel({
  agents,
  onRunWorkflow,
  onAgentSelect,
  selectedAgentId,
  isLoading,
  onCustomAgentCreated,
}: AgentTeamPanelProps) {
  const [searchQuery, setSearchQuery]     = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter]   = useState<StatusFilter>("all");
  const [localSelected, setLocalSelected] = useState<string | null>(null);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 200ms 디바운스 검색
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(searchQuery), 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  // 부모 selectedAgentId 와 동기화
  useEffect(() => {
    if (selectedAgentId !== undefined) setLocalSelected(selectedAgentId ?? null);
  }, [selectedAgentId]);

  // 필터 적용
  const filtered = agents.filter((a) => {
    const q = debouncedQuery.toLowerCase();
    const matchSearch =
      !q ||
      a.name.toLowerCase().includes(q) ||
      a.description?.toLowerCase().includes(q);
    const matchStatus =
      statusFilter === "all"  ? true :
      statusFilter === "idle" ? (a.status !== "active" && a.status !== "done" && a.status !== "error") :
      a.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const highlightedId = selectedAgentId !== undefined ? selectedAgentId : localSelected;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── 검색 + 필터 영역 ── */}
      <div style={{ padding: "14px 20px 10px", flexShrink: 0, borderBottom: `1px solid ${T.border}` }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: "#9CA3AF",
          marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em",
        }}>
          에이전트 팀
        </div>

        {/* 검색 Input */}
        <input
          type="text"
          placeholder="이름 또는 설명 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: "100%", boxSizing: "border-box",
            background: T.bg, border: `1px solid ${T.border}`,
            borderRadius: 6, padding: "5px 10px",
            fontSize: 12, color: T.text1, outline: "none",
            marginBottom: 8,
          }}
        />

        {/* 상태 필터 Pills */}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {STATUS_PILLS.map((p) => (
            <button
              key={p.key}
              onClick={() => setStatusFilter(p.key)}
              style={{
                padding: "3px 10px", borderRadius: 999,
                fontSize: 10, fontWeight: 600, cursor: "pointer",
                border: "none", transition: "all 0.12s",
                background: statusFilter === p.key ? `${p.color}22` : "transparent",
                color: statusFilter === p.key ? p.color : T.text3,
                outline: statusFilter === p.key ? `1px solid ${p.color}40` : "1px solid transparent",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 에이전트 테이블 ── */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          {/* Sticky 헤더 */}
          <thead>
            <tr style={{ position: "sticky", top: 0, background: T.bg, zIndex: 10 }}>
              <th style={{ width: 36, padding: "6px 6px 6px 20px", textAlign: "left", fontSize: 9, color: T.text3, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${T.border}` }}></th>
              <th style={{ width: "28%", padding: "6px 8px", textAlign: "left", fontSize: 9, color: T.text3, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${T.border}` }}>에이전트</th>
              <th style={{ padding: "6px 8px", textAlign: "left", fontSize: 9, color: T.text3, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${T.border}` }}>설명</th>
              <th style={{ width: 70, padding: "6px 12px 6px 8px", textAlign: "center", fontSize: 9, color: T.text3, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${T.border}` }}>상태</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }, (_, i) => (
                <SkeletonAgentRow key={i} />
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: "24px", textAlign: "center", color: T.text3, fontSize: 12 }}>
                  에이전트 없음
                </td>
              </tr>
            ) : (
              filtered.map((agent) => {
                const isSelected = highlightedId === agent.id;
                const isActive   = agent.status === "active";
                const statusColor = getStatusColor(agent.status);

                return (
                  <tr
                    key={agent.id}
                    onClick={() => {
                      // 우측 패널로 선택 전달
                      const next = isSelected ? null : agent.id;
                      setLocalSelected(next);
                      onAgentSelect?.(next);
                    }}
                    style={{
                      cursor: "pointer",
                      background: isSelected
                        ? "rgba(76,141,255,0.08)"
                        : isActive
                          ? `${agent.color}08`
                          : "transparent",
                      borderLeft: isSelected
                        ? `2px solid ${T.accent}`
                        : "2px solid transparent",
                      transition: "background 0.12s",
                    }}
                  >
                    {/* 아이콘 */}
                    <td style={{ padding: "8px 4px 8px 20px", fontSize: 18, lineHeight: 1, borderBottom: `1px solid ${T.border}22` }}>
                      {agent.icon}
                    </td>

                    {/* 이름 + 현재 태스크 */}
                    <td style={{ padding: "8px", borderBottom: `1px solid ${T.border}22` }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: isActive ? T.text1 : T.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {agent.name}
                      </div>
                      {isActive && agent.currentTask && (
                        <div style={{ fontSize: 9, color: T.text3, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {agent.currentTask}
                        </div>
                      )}
                    </td>

                    {/* 설명 */}
                    <td style={{ padding: "8px", borderBottom: `1px solid ${T.border}22` }}>
                      <div style={{ fontSize: 10, color: T.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {agent.description}
                      </div>
                    </td>

                    {/* 상태 dot + 레이블 */}
                    <td style={{ padding: "8px 12px 8px 8px", textAlign: "center", borderBottom: `1px solid ${T.border}22` }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                        <div style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: statusColor,
                          boxShadow: isActive ? `0 0 5px ${T.active}80` : "none",
                          animation: isActive ? "pulse-glow 2s ease-in-out infinite" : "none",
                          flexShrink: 0,
                        }} />
                        <span style={{ fontSize: 10, color: statusColor }}>
                          {isActive ? "실행" : agent.status === "error" ? "오류" : agent.status === "done" ? "완료" : "대기"}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── 커스텀 에이전트 생성 ── */}
      <div style={{ padding: "8px 20px", flexShrink: 0, borderTop: `1px solid ${T.border}` }}>
        {showCustomForm ? (
          <CustomAgentForm
            onSave={async (data) => {
              try {
                await fetch("/api/custom-agents", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(data),
                });
                setShowCustomForm(false);
                onCustomAgentCreated?.();
              } catch { /* ignore */ }
            }}
            onCancel={() => setShowCustomForm(false)}
          />
        ) : (
          <button
            onClick={() => setShowCustomForm(true)}
            style={{
              width: "100%", padding: "8px 0", borderRadius: 6, fontSize: 12,
              border: `1px solid rgba(99,102,241,0.3)`, background: "rgba(99,102,241,0.1)",
              color: "#A5B4FC", cursor: "pointer", fontWeight: 600,
            }}
          >
            + 커스텀 에이전트
          </button>
        )}
      </div>

      {/* ── 워크플로우 프리셋 ── */}
      <div style={{ borderTop: `1px solid ${T.border}`, padding: "12px 20px", flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#9CA3AF", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          워크플로우 프리셋
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {WORKFLOW_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => onRunWorkflow(preset.agents)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 14px", borderRadius: 8,
                border: `1px solid ${preset.color}25`,
                background: `${preset.color}08`,
                cursor: "pointer", textAlign: "left", transition: "all 0.12s",
              }}
            >
              <span style={{ fontSize: 18, flexShrink: 0 }}>{preset.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#F9FAFB", marginBottom: 1 }}>
                  {preset.name}
                </div>
                <div style={{ fontSize: 10, color: "#6B7280" }}>
                  {preset.agents.map((id) => agents.find((a) => a.id === id)?.name ?? id).join(" → ")}
                </div>
              </div>
              <span style={{ fontSize: 10, color: preset.color, flexShrink: 0 }}>실행 →</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
