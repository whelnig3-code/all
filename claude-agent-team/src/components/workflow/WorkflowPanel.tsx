"use client";

import { useState, useEffect, useCallback } from "react";
import { AGENTS_CONFIG } from "@/config/agents";

interface WorkflowMeta {
  id: string;
  name: string;
  description: string;
  steps: string[];
  createdAt: string;
  updatedAt: string;
}

interface AgentOption {
  id: string;
  name: string;
  icon: string;
  color: string;
}

/** 내장 에이전트 옵션 (AGENTS_CONFIG에서 파생) */
const BUILTIN_agentOptions: AgentOption[] = Object.values(AGENTS_CONFIG).map((a) => ({
  id: a.id,
  name: a.name,
  icon: a.icon,
  color: a.color,
}));

interface WorkflowPanelProps {
  onRunWorkflow?: (agentIds: string[]) => void;
}

export default function WorkflowPanel({ onRunWorkflow }: WorkflowPanelProps) {
  const [workflows, setWorkflows] = useState<WorkflowMeta[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newSteps, setNewSteps] = useState<string[]>([]);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [stepStatuses, setStepStatuses] = useState<Record<number, string>>({});
  const [agentOptions, setAgentOptions] = useState<AgentOption[]>(BUILTIN_agentOptions);

  const loadWorkflows = useCallback(async () => {
    try {
      const data = await fetch("/api/workflows").then((r) => r.json());
      setWorkflows(data.workflows ?? []);
    } catch { /* ignore */ }
  }, []);

  const loadAgentOptions = useCallback(async () => {
    try {
      const data = await fetch("/api/custom-agents").then((r) => r.json());
      const customOpts: AgentOption[] = (data.agents ?? []).map((a: AgentOption) => ({
        id: a.id, name: a.name, icon: a.icon, color: a.color,
      }));
      setAgentOptions([...BUILTIN_agentOptions, ...customOpts]);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadWorkflows(); loadAgentOptions(); }, [loadWorkflows, loadAgentOptions]);

  const handleCreate = async () => {
    if (!newName.trim() || newSteps.length === 0) return;
    await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, description: newDesc, steps: newSteps }),
    });
    setNewName("");
    setNewDesc("");
    setNewSteps([]);
    setShowCreate(false);
    loadWorkflows();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/workflows/${id}`, { method: "DELETE" });
    setWorkflows((prev) => prev.filter((w) => w.id !== id));
  };

  const handleRun = async (workflow: WorkflowMeta) => {
    setRunningId(workflow.id);
    setStepStatuses({});

    // onRunWorkflow prop이 있으면 기존 방식 (부모에서 처리)
    if (onRunWorkflow) {
      onRunWorkflow(workflow.steps);
    }

    // SSE로 실행 상태 수신
    try {
      const res = await fetch(`/api/workflows/${workflow.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "" }),
      });

      if (!res.ok || !res.body) {
        setRunningId(null);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.stepIndex !== undefined && data.status) {
                setStepStatuses((prev) => ({ ...prev, [data.stepIndex]: data.status }));
              }
            } catch { /* skip invalid JSON */ }
          }
        }
      }
    } catch { /* network error */ }

    setRunningId(null);
  };

  const toggleStep = (agentId: string) => {
    setNewSteps((prev) =>
      prev.includes(agentId) ? prev.filter((s) => s !== agentId) : [...prev, agentId]
    );
  };

  const moveStep = (idx: number, dir: -1 | 1) => {
    setNewSteps((prev) => {
      const arr = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return arr;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return arr;
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0A0A0B", overflow: "hidden" }}>
      {/* 헤더 */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>🔄</span>
          <span style={{ fontSize: 14, color: "#E5E7EB", fontWeight: 600 }}>워크플로우</span>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)",
            color: "#A78BFA", cursor: "pointer", fontSize: 12, padding: "5px 12px", borderRadius: 6,
          }}
        >
          + 새 워크플로우
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>

        {/* 생성 폼 */}
        {showCreate && (
          <div style={{
            background: "#111115", border: "1px solid rgba(139,92,246,0.25)",
            borderRadius: 10, padding: 16, marginBottom: 16,
          }}>
            <div style={{ fontSize: 12, color: "#C4B5FD", fontWeight: 600, marginBottom: 12 }}>새 워크플로우 생성</div>

            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="워크플로우 이름"
              style={{
                width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 6, padding: "7px 10px", color: "#F5F5F5", fontSize: 12,
                outline: "none", marginBottom: 8, boxSizing: "border-box",
              }}
            />
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="설명 (선택)"
              style={{
                width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 6, padding: "7px 10px", color: "#F5F5F5", fontSize: 12,
                outline: "none", marginBottom: 12, boxSizing: "border-box",
              }}
            />

            <div style={{ fontSize: 10, color: "#6B7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              에이전트 선택 (순서대로)
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {agentOptions.map((agent) => {
                const isSelected = newSteps.includes(agent.id);
                const stepIdx = newSteps.indexOf(agent.id);
                return (
                  <button
                    key={agent.id}
                    onClick={() => toggleStep(agent.id)}
                    style={{
                      background: isSelected ? `${agent.color}22` : "rgba(255,255,255,0.04)",
                      border: `1px solid ${isSelected ? agent.color + "66" : "rgba(255,255,255,0.08)"}`,
                      borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                      color: isSelected ? agent.color : "#6B7280", fontSize: 11,
                      display: "flex", alignItems: "center", gap: 4,
                    }}
                  >
                    {agent.icon} {agent.name}
                    {isSelected && (
                      <span style={{ fontSize: 10, background: agent.color, color: "#fff", borderRadius: "50%", width: 14, height: 14, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                        {stepIdx + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {newSteps.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 6 }}>순서 조정:</div>
                {newSteps.map((stepId, idx) => {
                  const agent = agentOptions.find((a) => a.id === stepId);
                  if (!agent) return null;
                  return (
                    <div key={stepId} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: "#4B5563", width: 14 }}>{idx + 1}.</span>
                      <span style={{ flex: 1, fontSize: 11, color: agent.color }}>{agent.icon} {agent.name}</span>
                      <button onClick={() => moveStep(idx, -1)} disabled={idx === 0}
                        style={{ background: "none", border: "none", color: idx === 0 ? "#2D3748" : "#6B7280", cursor: idx === 0 ? "default" : "pointer", fontSize: 12, padding: "0 4px" }}>↑</button>
                      <button onClick={() => moveStep(idx, 1)} disabled={idx === newSteps.length - 1}
                        style={{ background: "none", border: "none", color: idx === newSteps.length - 1 ? "#2D3748" : "#6B7280", cursor: idx === newSteps.length - 1 ? "default" : "pointer", fontSize: 12, padding: "0 4px" }}>↓</button>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || newSteps.length === 0}
                style={{
                  flex: 1, background: newName.trim() && newSteps.length > 0 ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${newName.trim() && newSteps.length > 0 ? "rgba(139,92,246,0.4)" : "rgba(255,255,255,0.06)"}`,
                  color: newName.trim() && newSteps.length > 0 ? "#A78BFA" : "#4B5563",
                  cursor: newName.trim() && newSteps.length > 0 ? "pointer" : "default",
                  borderRadius: 6, padding: "6px 0", fontSize: 12,
                }}
              >
                저장
              </button>
              <button
                onClick={() => { setShowCreate(false); setNewName(""); setNewDesc(""); setNewSteps([]); }}
                style={{
                  background: "none", border: "1px solid rgba(255,255,255,0.06)",
                  color: "#6B7280", cursor: "pointer", borderRadius: 6, padding: "6px 14px", fontSize: 12,
                }}
              >
                취소
              </button>
            </div>
          </div>
        )}

        {/* 워크플로우 목록 */}
        {workflows.length === 0 && !showCreate ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#2D3748" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔄</div>
            <div style={{ fontSize: 13 }}>워크플로우가 없습니다</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>에이전트 파이프라인을 저장해서 재사용하세요</div>
          </div>
        ) : (
          workflows.map((wf) => {
            const isRunning = runningId === wf.id;
            return (
              <div
                key={wf.id}
                style={{
                  background: "#111115", border: `1px solid ${isRunning ? "rgba(139,92,246,0.4)" : "rgba(255,255,255,0.06)"}`,
                  borderRadius: 10, padding: 14, marginBottom: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, color: "#E5E7EB", fontWeight: 600 }}>{wf.name}</div>
                    {wf.description && (
                      <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{wf.description}</div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => handleRun(wf)}
                      disabled={isRunning || !onRunWorkflow}
                      style={{
                        background: isRunning ? "rgba(139,92,246,0.25)" : "rgba(139,92,246,0.15)",
                        border: `1px solid ${isRunning ? "rgba(139,92,246,0.5)" : "rgba(139,92,246,0.3)"}`,
                        color: "#A78BFA", cursor: isRunning ? "default" : "pointer",
                        fontSize: 11, padding: "4px 10px", borderRadius: 5,
                      }}
                    >
                      {isRunning ? "⏳ 실행 중" : "▶ 실행"}
                    </button>
                    <button
                      onClick={() => handleDelete(wf.id)}
                      style={{
                        background: "none", border: "1px solid rgba(239,68,68,0.2)",
                        color: "#EF4444", cursor: "pointer", fontSize: 11, padding: "4px 8px", borderRadius: 5,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* 스텝 시각화 */}
                <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                  {wf.steps.map((stepId, idx) => {
                    const agent = agentOptions.find((a) => a.id === stepId);
                    if (!agent) return null;
                    const status = isRunning ? stepStatuses[idx] : undefined;
                    const statusIcon = status === "completed" ? "✓" : status === "failed" ? "✕" : status === "running" ? "⏳" : "";
                    return (
                      <div key={idx} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{
                          background: status === "completed" ? `${agent.color}30` : `${agent.color}18`,
                          border: `1px solid ${status === "running" ? agent.color : agent.color + "44"}`,
                          borderRadius: 5, padding: "3px 8px",
                          fontSize: 10, color: agent.color,
                          display: "flex", alignItems: "center", gap: 3,
                        }}>
                          {statusIcon || agent.icon} {agent.name}
                        </div>
                        {idx < wf.steps.length - 1 && (
                          <span style={{ color: "#2D3748", fontSize: 12 }}>→</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
