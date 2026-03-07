"use client";

import { useState, useEffect, useCallback } from "react";
import { useTheme } from "@/context/ThemeContext";

const AGENTS = [
  { id: "planner", name: "플래너", icon: "📋", color: "#8B5CF6" },
  { id: "developer", name: "개발자", icon: "⚡", color: "#3B82F6" },
  { id: "reviewer", name: "리뷰어", icon: "🔍", color: "#22C55E" },
  { id: "writer", name: "문서 작성자", icon: "📝", color: "#F59E0B" },
  { id: "security-auditor", name: "보안 감사자", icon: "🔒", color: "#EF4444" },
  { id: "researcher", name: "리서처", icon: "🔬", color: "#06B6D4" },
  { id: "designer", name: "디자이너", icon: "🎨", color: "#EC4899" },
];

const MODELS = ["sonnet", "haiku", "opus"];

interface AgentInfo {
  id: string;
  name: string;
  active: boolean;
  model: string;
  totalCost?: number;
  totalRequests?: number;
}

interface AppSettings {
  projectBasePath: string;
  defaultModel: string;
  agentModels: Record<string, string>;
}

type ActiveSection = "agents" | "project" | "models" | "theme" | "routing";

interface ApiKeyStatus {
  configured: boolean;
  masked: string | null;
}

interface RoutingRuleItem {
  id: string;
  priority: number;
  agent: string;
  keywords: string[];
  description: string;
  editable: boolean;
}

export default function SettingsPanel() {
  const [agentStatuses, setAgentStatuses] = useState<AgentInfo[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [activeSection, setActiveSection] = useState<ActiveSection>("agents");
  const [savingPath, setSavingPath] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus | null>(null);
  const [claudeMode, setClaudeMode] = useState<string>("api");
  const { theme, toggleTheme } = useTheme();

  // 라우팅 규칙 상태
  const [routingRules, setRoutingRules] = useState<RoutingRuleItem[]>([]);
  const [newRule, setNewRule] = useState({ agent: "developer", keywords: "", description: "" });
  const [addingRule, setAddingRule] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [agentsRes, settingsRes] = await Promise.all([
        fetch("/api/agents").then((r) => r.json()),
        fetch("/api/settings").then((r) => r.json()),
      ]);
      setAgentStatuses(agentsRes.agents ?? []);
      setSettings(settingsRes.settings);
      setPathInput(settingsRes.settings?.projectBasePath ?? "");
      setApiKeyStatus(settingsRes.apiKeyStatus ?? null);
      setClaudeMode(settingsRes.claudeMode ?? "api");
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const loadRoutingRules = useCallback(async () => {
    try {
      const res = await fetch("/api/routing-rules").then((r) => r.json());
      setRoutingRules(res.rules ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (activeSection === "routing") loadRoutingRules();
  }, [activeSection, loadRoutingRules]);

  const handleAddRule = async () => {
    const keywords = newRule.keywords.split(",").map((k) => k.trim()).filter(Boolean);
    if (!keywords.length || !newRule.description.trim()) return;
    setAddingRule(true);
    try {
      await fetch("/api/routing-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: 100, agent: newRule.agent, keywords, description: newRule.description }),
      });
      setNewRule({ agent: "developer", keywords: "", description: "" });
      await loadRoutingRules();
      showSaved("규칙 추가됨");
    } catch { /* ignore */ }
    setAddingRule(false);
  };

  const handleDeleteRule = async (id: string) => {
    try {
      await fetch("/api/routing-rules", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await loadRoutingRules();
      showSaved("규칙 삭제됨");
    } catch { /* ignore */ }
  };

  const showSaved = (label: string) => {
    setSaved(label);
    setTimeout(() => setSaved(null), 1500);
  };

  const toggleAgent = async (agentId: string, active: boolean) => {
    setAgentStatuses((prev) =>
      prev.map((a) => a.id === agentId ? { ...a, active } : a)
    );
    await fetch("/api/agents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, active }),
    });
    showSaved("에이전트 설정 저장됨");
  };

  const updateAgentModel = async (agentId: string, model: string) => {
    setSettings((prev) => prev ? {
      ...prev, agentModels: { ...prev.agentModels, [agentId]: model }
    } : prev);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentModels: { [agentId]: model } }),
    });
    showSaved("모델 설정 저장됨");
  };

  const saveProjectPath = async () => {
    if (!pathInput.trim()) return;
    setSavingPath(true);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectBasePath: pathInput }),
    });
    setSavingPath(false);
    showSaved("경로 저장됨");
  };

  const sections: { id: ActiveSection; label: string; icon: string }[] = [
    { id: "agents", label: "에이전트", icon: "🤖" },
    { id: "models", label: "모델 설정", icon: "🧠" },
    { id: "project", label: "프로젝트 설정", icon: "⚙️" },
    { id: "routing", label: "라우팅 규칙", icon: "🔀" },
    { id: "theme", label: "테마", icon: "🎨" },
  ];

  return (
    <div style={{ display: "flex", height: "100%", background: "var(--bg)", overflow: "hidden" }}>
      {/* 사이드 섹션 네비 */}
      <div style={{
        width: 160, borderRight: "1px solid var(--border)",
        padding: "16px 8px", flexShrink: 0, background: "var(--card)",
      }}>
        <div style={{ fontSize: 10, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", padding: "0 6px", marginBottom: 8 }}>
          설정
        </div>
        {sections.map((sec) => (
          <button
            key={sec.id}
            onClick={() => setActiveSection(sec.id)}
            style={{
              width: "100%", background: activeSection === sec.id ? "rgba(139,92,246,0.12)" : "none",
              border: "none", borderRadius: 6, padding: "8px 10px", cursor: "pointer",
              color: activeSection === sec.id ? "#C4B5FD" : "#6B7280",
              fontSize: 12, textAlign: "left", display: "flex", alignItems: "center", gap: 7,
              marginBottom: 2,
            }}
          >
            <span>{sec.icon}</span>
            <span>{sec.label}</span>
          </button>
        ))}
      </div>

      {/* 콘텐츠 */}
      <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>

        {/* API 키 상태 배너 */}
        {apiKeyStatus && !apiKeyStatus.configured && (
          <div style={{
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
            borderRadius: 10, padding: "14px 18px", marginBottom: 20,
            display: "flex", alignItems: "flex-start", gap: 12,
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#FCA5A5", marginBottom: 4 }}>
                ANTHROPIC_API_KEY 가 설정되지 않았습니다
              </div>
              <div style={{ fontSize: 12, color: "var(--text3)", lineHeight: 1.6 }}>
                {claudeMode === "sdk"
                  ? "SDK 모드: Claude Code CLI 가 직접 인증을 처리합니다. claude 명령이 작동하면 정상입니다."
                  : ".env.local 파일에 ANTHROPIC_API_KEY=sk-ant-... 를 추가하고 서버를 재시작하세요."
                }
              </div>
            </div>
          </div>
        )}
        {apiKeyStatus?.configured && (
          <div style={{
            background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)",
            borderRadius: 10, padding: "10px 18px", marginBottom: 20,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 14 }}>🔑</span>
            <div style={{ fontSize: 12, color: "#6B7280" }}>
              API 키 설정됨 <span style={{ color: "#4ADE80" }}>{apiKeyStatus.masked}</span>
              <span style={{ marginLeft: 8, color: "#4B5563" }}>모드: {claudeMode.toUpperCase()}</span>
            </div>
          </div>
        )}

        {/* 저장 알림 */}
        {saved && (
          <div style={{
            position: "fixed", top: 20, right: 20, zIndex: 100,
            background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)",
            color: "#4ADE80", borderRadius: 8, padding: "8px 16px", fontSize: 12,
          }}>
            ✓ {saved}
          </div>
        )}

        {/* 에이전트 활성화 */}
        {activeSection === "agents" && (
          <div>
            <div style={{ fontSize: 14, color: "var(--text1)", fontWeight: 600, marginBottom: 4 }}>에이전트 활성화</div>
            <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 20 }}>비활성화된 에이전트는 채팅에서 선택할 수 없습니다.</div>

            {AGENTS.map((agent) => {
              const status = agentStatuses.find((a) => a.id === agent.id);
              const isActive = status?.active !== false;
              return (
                <div
                  key={agent.id}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 16px", background: "var(--card)",
                    border: "1px solid var(--border)", borderRadius: 8, marginBottom: 8,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 18 }}>{agent.icon}</span>
                    <div>
                      <div style={{ fontSize: 13, color: isActive ? "var(--text1)" : "var(--text3)", fontWeight: 500 }}>
                        {agent.name}
                      </div>
                      {status?.totalCost !== undefined && (
                        <div style={{ fontSize: 10, color: "var(--text3)" }}>
                          ${status.totalCost.toFixed(4)} 사용 · {status.totalRequests ?? 0}회
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleAgent(agent.id, !isActive)}
                    style={{
                      width: 40, height: 22, borderRadius: 11,
                      background: isActive ? "#8B5CF6" : "#1F2937",
                      border: "none", cursor: "pointer", position: "relative",
                      transition: "background 0.2s",
                    }}
                  >
                    <div style={{
                      position: "absolute", top: 3,
                      left: isActive ? 21 : 3,
                      width: 16, height: 16, borderRadius: "50%",
                      background: "#fff", transition: "left 0.2s",
                    }} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* 모델 설정 */}
        {activeSection === "models" && (
          <div>
            <div style={{ fontSize: 14, color: "var(--text1)", fontWeight: 600, marginBottom: 4 }}>모델 설정</div>
            <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 20 }}>에이전트별 Claude 모델을 선택하세요.</div>

            {AGENTS.map((agent) => {
              const currentModel = settings?.agentModels?.[agent.id] ?? settings?.defaultModel ?? "sonnet";
              return (
                <div
                  key={agent.id}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 16px", background: "var(--card)",
                    border: "1px solid var(--border)", borderRadius: 8, marginBottom: 8,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 16 }}>{agent.icon}</span>
                    <span style={{ fontSize: 13, color: "var(--text1)" }}>{agent.name}</span>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {MODELS.map((model) => (
                      <button
                        key={model}
                        onClick={() => updateAgentModel(agent.id, model)}
                        style={{
                          background: currentModel === model ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.04)",
                          border: `1px solid ${currentModel === model ? "rgba(139,92,246,0.4)" : "rgba(255,255,255,0.08)"}`,
                          color: currentModel === model ? "#A78BFA" : "#6B7280",
                          cursor: "pointer", fontSize: 11, padding: "4px 10px", borderRadius: 5,
                        }}
                      >
                        {model}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 프로젝트 설정 */}
        {activeSection === "project" && (
          <div>
            <div style={{ fontSize: 14, color: "var(--text1)", fontWeight: 600, marginBottom: 4 }}>프로젝트 설정</div>
            <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 20 }}>에이전트가 파일을 읽고 쓸 기본 경로를 설정합니다.</div>

            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600, marginBottom: 8 }}>프로젝트 기본 경로</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={pathInput}
                  onChange={(e) => setPathInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveProjectPath()}
                  style={{
                    flex: 1, background: "var(--bg)",
                    border: "1px solid var(--border)", borderRadius: 6,
                    padding: "8px 12px", color: "var(--text1)", fontSize: 12,
                    outline: "none", fontFamily: "monospace",
                  }}
                />
                <button
                  onClick={saveProjectPath}
                  disabled={savingPath}
                  style={{
                    background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)",
                    color: "#A78BFA", cursor: "pointer", borderRadius: 6,
                    padding: "8px 16px", fontSize: 12, flexShrink: 0,
                  }}
                >
                  {savingPath ? "저장 중..." : "저장"}
                </button>
              </div>
              <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 6 }}>
                현재: {settings?.projectBasePath ?? "로드 중..."}
              </div>
            </div>

            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600, marginBottom: 8 }}>기본 모델</div>
              <div style={{ display: "flex", gap: 6 }}>
                {MODELS.map((model) => (
                  <button
                    key={model}
                    onClick={async () => {
                      setSettings((prev) => prev ? { ...prev, defaultModel: model } : prev);
                      await fetch("/api/settings", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ defaultModel: model }),
                      });
                      showSaved("기본 모델 저장됨");
                    }}
                    style={{
                      background: settings?.defaultModel === model ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${settings?.defaultModel === model ? "rgba(139,92,246,0.4)" : "rgba(255,255,255,0.08)"}`,
                      color: settings?.defaultModel === model ? "#A78BFA" : "#6B7280",
                      cursor: "pointer", fontSize: 12, padding: "6px 14px", borderRadius: 6,
                    }}
                  >
                    {model}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 라우팅 규칙 */}
        {activeSection === "routing" && (
          <div>
            <div style={{ fontSize: 14, color: "var(--text1)", fontWeight: 600, marginBottom: 4 }}>라우팅 규칙</div>
            <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 20 }}>
              메시지 키워드 기반으로 에이전트를 자동 선택하는 규칙입니다. 커스텀 규칙을 추가할 수 있습니다.
            </div>

            {/* 규칙 추가 폼 */}
            <div style={{
              background: "var(--card)", border: "1px solid var(--border)",
              borderRadius: 10, padding: 16, marginBottom: 16,
            }}>
              <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600, marginBottom: 10, textTransform: "uppercase" }}>
                새 규칙 추가
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <select
                    value={newRule.agent}
                    onChange={(e) => setNewRule((prev) => ({ ...prev, agent: e.target.value }))}
                    style={{
                      background: "var(--bg)", color: "var(--text1)",
                      border: "1px solid var(--border)", borderRadius: 6,
                      padding: "6px 10px", fontSize: 12, width: 140,
                    }}
                  >
                    {AGENTS.map((a) => (
                      <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
                    ))}
                  </select>
                  <input
                    value={newRule.keywords}
                    onChange={(e) => setNewRule((prev) => ({ ...prev, keywords: e.target.value }))}
                    placeholder="키워드 (쉼표 구분)"
                    style={{
                      flex: 1, background: "var(--bg)", color: "var(--text1)",
                      border: "1px solid var(--border)", borderRadius: 6,
                      padding: "6px 10px", fontSize: 12, outline: "none",
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={newRule.description}
                    onChange={(e) => setNewRule((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="규칙 설명"
                    style={{
                      flex: 1, background: "var(--bg)", color: "var(--text1)",
                      border: "1px solid var(--border)", borderRadius: 6,
                      padding: "6px 10px", fontSize: 12, outline: "none",
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleAddRule()}
                  />
                  <button
                    onClick={handleAddRule}
                    disabled={addingRule || !newRule.keywords.trim() || !newRule.description.trim()}
                    style={{
                      background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)",
                      color: "#A78BFA", cursor: "pointer", borderRadius: 6,
                      padding: "6px 14px", fontSize: 12, flexShrink: 0,
                      opacity: addingRule || !newRule.keywords.trim() || !newRule.description.trim() ? 0.5 : 1,
                    }}
                  >
                    {addingRule ? "추가 중..." : "추가"}
                  </button>
                </div>
              </div>
            </div>

            {/* 규칙 목록 */}
            {routingRules.map((rule) => {
              const agent = AGENTS.find((a) => a.id === rule.agent);
              return (
                <div
                  key={rule.id}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px", background: "var(--card)",
                    border: "1px solid var(--border)", borderRadius: 8, marginBottom: 6,
                    opacity: rule.editable ? 1 : 0.7,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{agent?.icon ?? "🔧"}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, color: "var(--text1)", fontWeight: 500 }}>
                          {agent?.name ?? rule.agent}
                        </span>
                        <span style={{
                          fontSize: 9, color: "var(--text3)", background: "var(--bg)",
                          padding: "1px 6px", borderRadius: 3, fontFamily: "monospace",
                        }}>
                          P{rule.priority}
                        </span>
                        {!rule.editable && (
                          <span style={{
                            fontSize: 9, color: "var(--text3)", background: "var(--bg)",
                            padding: "1px 6px", borderRadius: 3,
                          }}>
                            기본
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {rule.description}
                      </div>
                      {rule.keywords.length > 0 && (
                        <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                          {rule.keywords.slice(0, 5).map((kw) => (
                            <span
                              key={kw}
                              style={{
                                fontSize: 10, color: "var(--accent)", background: "rgba(76,141,255,0.08)",
                                padding: "1px 6px", borderRadius: 3, fontFamily: "monospace",
                              }}
                            >
                              {kw}
                            </span>
                          ))}
                          {rule.keywords.length > 5 && (
                            <span style={{ fontSize: 10, color: "var(--text3)" }}>+{rule.keywords.length - 5}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {rule.editable && (
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      title="삭제"
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "var(--text3)", fontSize: 14, padding: "4px 8px",
                        flexShrink: 0,
                      }}
                    >
                      🗑️
                    </button>
                  )}
                </div>
              );
            })}

            {routingRules.length === 0 && (
              <div style={{ textAlign: "center", color: "var(--text3)", fontSize: 12, padding: 24 }}>
                규칙을 불러오는 중...
              </div>
            )}
          </div>
        )}

        {/* 테마 설정 */}
        {activeSection === "theme" && (
          <div>
            <div style={{ fontSize: 14, color: "var(--text1)", fontWeight: 600, marginBottom: 4 }}>테마</div>
            <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 20 }}>대시보드의 외관 테마를 설정합니다.</div>

            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 20px", background: "var(--card)",
              border: "1px solid var(--border)", borderRadius: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 24 }}>{theme === "dark" ? "🌙" : "☀️"}</span>
                <div>
                  <div style={{ fontSize: 14, color: "var(--text1)", fontWeight: 600 }}>
                    {theme === "dark" ? "다크 모드" : "라이트 모드"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
                    {theme === "dark"
                      ? "어두운 배경으로 눈의 피로를 줄입니다"
                      : "밝은 배경으로 가독성을 높입니다"}
                  </div>
                </div>
              </div>
              <button
                onClick={toggleTheme}
                style={{
                  width: 48, height: 26, borderRadius: 13,
                  background: theme === "light" ? "#2563EB" : "#374151",
                  border: "none", cursor: "pointer", position: "relative",
                  transition: "background 0.2s",
                  flexShrink: 0,
                }}
              >
                <div style={{
                  position: "absolute", top: 3,
                  left: theme === "light" ? 25 : 3,
                  width: 20, height: 20, borderRadius: "50%",
                  background: "#fff", transition: "left 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
