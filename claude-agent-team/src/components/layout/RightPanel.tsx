"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Agent } from "@/types";
import { AgentLogEntry } from "@/hooks/useAgentStatus";
import { T } from "@/lib/ui-tokens";
import { Badge } from "@/components/ui/Badge";
import { renderMarkdown } from "@/lib/utils/markdown";

interface FileChangedEvent {
  path: string;
  action: "create" | "modify" | "delete";
  agentId: string;
  timestamp: number;
}

/** 라우팅 이벤트 (ChatArea → page.tsx → RightPanel Timeline) */
export interface RoutingLogEntry {
  method: "explicit" | "keyword" | "gate" | "fallback" | "loop-protect" | "inferred" | "project-default" | "default";
  targetAgent: string;
  matchedKeywords?: string[];
  reason: string;
  gateReason?: string;
  originalAgent?: string;
  timestamp: number;
}

interface RightPanelProps {
  agents: Agent[];
  agentLogs: AgentLogEntry[];
  changedFiles: FileChangedEvent[];
  width?: number;
  sessionStats?: {
    userCount: number;
    agentCount: number;
    toolCount: number;
    firstTask?: string;
  };
  selectedAgent?: Agent | null;
  previewContent?: string | null;    // ChatArea 에이전트 응답 (Preview 탭용)
  showPreviewTab?: boolean;          // false면 Preview 탭 숨김 (21:9 분리 패널 시)
  /** Intent 라우팅 로그 — Timeline에 ROUTE 이벤트로 표시 */
  routingLog?: RoutingLogEntry[];
}

// ── Quick Action: /api/agents PATCH 호출 ──────────────────────────────────────
async function patchAgent(agentId: string, active: boolean) {
  await fetch("/api/agents", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId, active }),
  });
}

// ── 로그 레벨 색상 맵 ─────────────────────────────────────────────────────────
// ROUTE 레벨 포함한 확장 색상 맵
const LEVEL_COLOR: Record<AgentLogEntry["level"] | "ROUTE", string> = {
  INFO:    "#4C8DFF",
  SUCCESS: "#22C55E",
  WARN:    "#F59E0B",
  ERROR:   "#EF4444",
  DEBUG:   "#6B7280",
  CMD:     "#34D399",
  COST:    "#F59E0B",
  SYS:     "#9CA3AF",
  ROUTE:   "#8B5CF6",  // 보라 — Intent 라우팅
};

const LEVEL_BG: Record<AgentLogEntry["level"] | "ROUTE", string> = {
  INFO:    "#4C8DFF0D",
  SUCCESS: "#22C55E0D",
  WARN:    "#F59E0B0D",
  ERROR:   "#EF44440D",
  DEBUG:   "transparent",
  CMD:     "#34D3990D",
  COST:    "#F59E0B0D",
  SYS:     "transparent",
  ROUTE:   "#8B5CF60D",  // 보라 배경
};

// ── 로그 필터 Pill 정의 ───────────────────────────────────────────────────────
type LogFilter = "all" | "info" | "warn" | "error" | "debug";

const LOG_FILTER_LEVELS: Record<Exclude<LogFilter, "all">, AgentLogEntry["level"][]> = {
  info:  ["INFO", "SUCCESS", "SYS"],
  warn:  ["WARN", "COST"],
  error: ["ERROR"],
  debug: ["DEBUG", "CMD"],
};

const LOG_FILTER_PILLS: { key: LogFilter; label: string; color: string }[] = [
  { key: "all",   label: "All",   color: T.text2 },
  { key: "info",  label: "Info",  color: "#4C8DFF" },
  { key: "warn",  label: "Warn",  color: "#F59E0B" },
  { key: "error", label: "Error", color: "#EF4444" },
  { key: "debug", label: "Debug", color: "#6B7280" },
];

/** 프리뷰 콘텐츠 타입 자동 감지 */
function detectPreviewType(content: string): "image" | "html" | "json" | "markdown" | "code" {
  const t = content.trim();
  // 이미지 URL 패턴
  if (/^https?:\/\/\S+\.(png|jpg|jpeg|gif|svg|webp|ico)(\?.*)?$/i.test(t)) return "image";
  // HTML 패턴
  if (t.startsWith("<") && /<\/?\w+[\s>/]/.test(t)) return "html";
  // JSON 패턴
  try { JSON.parse(t); return "json"; } catch { /* not json */ }
  // Markdown 패턴
  if (t.startsWith("#") || t.includes("```") || /\*\*.+\*\*/.test(t) || t.includes("---")) return "markdown";
  return "code";
}

// ── RightTab 타입 ─────────────────────────────────────────────────────────────
type RightTab = "logs" | "timeline" | "preview";

export default function RightPanel({
  agents,
  agentLogs,
  changedFiles,
  width = 280,
  routingLog,
  sessionStats,
  selectedAgent,
  previewContent,
  showPreviewTab = true,
}: RightPanelProps) {
  // ── 파일 미리보기 상태 ─────────────────────────────────────────────────────
  const [previewFile, setPreviewFile]       = useState<{ path: string; content: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // ── STEP 2: Quick Action / Raw JSON / 선택 에이전트 에러 강조 ──────────────
  const [rawJsonOpen, setRawJsonOpen] = useState(false);
  const [actionMsg,   setActionMsg]   = useState<string | null>(null);
  const [errorFlash,  setErrorFlash]  = useState(false);
  const prevStatusRef = useRef<string | undefined>(undefined);

  // ── STEP 3: 로그 필터 / Auto-scroll / 헤더 플래시 ──────────────────────────
  const [logFilter,      setLogFilter]      = useState<LogFilter>("all");
  const [autoScroll,     setAutoScroll]     = useState(true);
  const [logHeaderFlash, setLogHeaderFlash] = useState(false);

  const logsContainerRef = useRef<HTMLDivElement>(null);
  const lastErrorIdRef   = useRef<string | null>(null);

  // ── STEP 6: 탭 구조 + Timeline + Preview ──────────────────────────────────
  const [rightTab,        setRightTab]        = useState<RightTab>("logs");
  const [timelineExpanded, setTimelineExpanded] = useState(false);

  // ── 선택 에이전트 에러 → 섹션 배경 플래시 ────────────────────────────────
  useEffect(() => {
    if (selectedAgent?.status === "error" && prevStatusRef.current !== "error") {
      setErrorFlash(true);
      const t = setTimeout(() => setErrorFlash(false), 1000);
      return () => clearTimeout(t);
    }
    prevStatusRef.current = selectedAgent?.status;
  }, [selectedAgent?.status]);

  // ── ERROR 로그 수신 → 로그 헤더 플래시 ────────────────────────────────────
  // (에러 토스트는 전역 ToastProvider가 처리, 여기선 헤더 플래시만 담당)
  useEffect(() => {
    const newest = agentLogs[0];
    if (!newest || newest.level !== "ERROR" || newest.id === lastErrorIdRef.current) return;
    lastErrorIdRef.current = newest.id;
    // 로그 헤더 border 플래시
    setLogHeaderFlash(true);
    setTimeout(() => setLogHeaderFlash(false), 1000);
  }, [agentLogs]);

  // ── Ctrl+Shift+T → Timeline 탭 전환 + 확장/축소 토글 ──────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "T") {
        e.preventDefault();
        setRightTab("timeline");
        setTimelineExpanded((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── 로그 필터링 + 정렬 (oldest-first for display) ─────────────────────────
  const displayLogs = useMemo(() => {
    let logs = selectedAgent
      ? agentLogs.filter((l) => !l.agentId || l.agentId === selectedAgent.id)
      : agentLogs;
    if (logFilter !== "all") {
      const levels = LOG_FILTER_LEVELS[logFilter];
      logs = logs.filter((l) => levels.includes(l.level));
    }
    return logs.slice(0, 100).reverse();
  }, [agentLogs, selectedAgent, logFilter]);

  // ── Timeline 이벤트: 로그 + 라우팅 이벤트 병합 ───────────────────────────
  const timelineEvents = useMemo(() => {
    const limit = timelineExpanded ? 20 : 5;

    // 기존 로그 이벤트 (SUCCESS/ERROR/WARN/CMD)
    type TimelineItem = {
      id: string;
      level: AgentLogEntry["level"] | "ROUTE";
      msg: string;
      agentId?: string;
      time: string;
      _ts: number;
    };

    const logItems: TimelineItem[] = agentLogs
      .filter((l) => ["SUCCESS", "ERROR", "WARN", "CMD"].includes(l.level))
      .map((l) => ({
        ...l,
        _ts: 0, // agentLogs에 타임스탬프 없어 0으로 대체 (순서 유지)
      }));

    // 라우팅 이벤트를 TimelineItem으로 변환
    const routeItems: TimelineItem[] = (routingLog ?? []).map((r) => ({
      id: `route-${r.timestamp}`,
      level: "ROUTE" as const,
      msg: r.method === "gate"
        ? `⚠ Gate: ${r.originalAgent} → ${r.targetAgent}`
        : r.method === "keyword"
        ? `→ ${r.targetAgent}  ⌗ ${r.matchedKeywords?.slice(0, 2).join(", ") ?? ""}`
        : r.method === "explicit"
        ? `→ ${r.targetAgent}  [Direct]`
        : `→ ${r.targetAgent}  [Auto]`,
      agentId: r.targetAgent,
      time: new Date(r.timestamp).toLocaleTimeString("ko-KR", {
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      }),
      _ts: r.timestamp,
    }));

    // 라우팅 항목을 앞에 배치 (최신순), 로그 항목은 기존 순서 유지
    return [...routeItems.reverse(), ...logItems].slice(0, limit);
  }, [agentLogs, routingLog, timelineExpanded]);

  // ── Auto-scroll: displayLogs 길이 변화 시 바닥으로 ────────────────────────
  useEffect(() => {
    if (!autoScroll) return;
    const el = logsContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [displayLogs.length, autoScroll]);

  // ── 파일 미리보기 자동 로드 ───────────────────────────────────────────────
  const hasActiveAgent = agents.some((a) => a.status === "active");
  const latestFile     = changedFiles.length > 0 ? changedFiles[changedFiles.length - 1] : null;

  const fetchPreview = useCallback(async (filePath: string) => {
    if (!filePath) return;
    setPreviewLoading(true);
    try {
      const res  = await fetch(`/api/files?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      if (data.content) setPreviewFile({ path: filePath, content: data.content });
    } catch {
      // ignore
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasActiveAgent && latestFile && latestFile.action !== "delete") {
      fetchPreview(latestFile.path);
    }
  }, [latestFile?.path, hasActiveAgent, fetchPreview]);

  // ── Quick Actions ─────────────────────────────────────────────────────────
  const handleRun = async () => {
    if (!selectedAgent) return;
    await patchAgent(selectedAgent.id, true);
    setActionMsg("▶ 실행 요청");
    setTimeout(() => setActionMsg(null), 2000);
  };
  const handleKill = async () => {
    if (!selectedAgent) return;
    await patchAgent(selectedAgent.id, false);
    setActionMsg("■ 종료 요청");
    setTimeout(() => setActionMsg(null), 2000);
  };
  const handleRestart = async () => {
    if (!selectedAgent) return;
    await patchAgent(selectedAgent.id, false);
    await new Promise((r) => setTimeout(r, 300));
    await patchAgent(selectedAgent.id, true);
    setActionMsg("↺ 재시작 요청");
    setTimeout(() => setActionMsg(null), 2000);
  };

  // ── 기타 계산 ─────────────────────────────────────────────────────────────
  const activeAgents = agents.filter((a) => a.status === "active");
  const doneAgents   = agents.filter((a) => a.status === "done");
  const idleAgents   = agents.filter((a) => a.status !== "active" && a.status !== "done" && a.status !== "error");

  const previewLines = previewFile?.content
    ? previewFile.content.split("\n").slice(-40).join("\n")
    : null;
  const fileName = previewFile ? previewFile.path.split(/[/\\]/).pop() : null;

  const badgeStatus =
    selectedAgent?.status === "active"  ? "active"  :
    selectedAgent?.status === "error"   ? "error"   :
    selectedAgent?.status === "done"    ? "pending" :
    "disabled";

  // 공통 섹션 레이블 스타일
  const sectionLabel: React.CSSProperties = {
    fontSize: 9, color: T.text3, fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8,
  };

  return (
    <div
      style={{
        width, minWidth: width,
        borderLeft: `1px solid ${T.border}`,
        background: T.card,
        display: "flex", flexDirection: "column",
        overflow: "hidden", flexShrink: 0,
        position: "relative",
      }}
    >
      {/* ── 선택 에이전트 상단 고정 정보 ── */}
      {selectedAgent && (
        <div style={{
          padding: "10px 14px",
          borderBottom: `1px solid ${errorFlash ? T.error : T.border}`,
          flexShrink: 0,
          transition: "border-color 0.3s ease",
          background: errorFlash ? `${T.error}08` : "transparent",
        }}>
          <div style={sectionLabel}>선택 에이전트</div>

          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
            <span style={{ fontSize: 16 }}>{selectedAgent.icon}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.text1, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {selectedAgent.name}
            </span>
            <div style={{
              transition: "box-shadow 0.3s ease",
              boxShadow: errorFlash ? `0 0 8px ${T.error}` : "none",
              borderRadius: 999,
            }}>
              <Badge status={badgeStatus} />
            </div>
          </div>

          <div style={{ fontSize: 9, color: T.text3, marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selectedAgent.currentTask
              ? `⚙ ${selectedAgent.currentTask}`
              : `모델: ${selectedAgent.model}`}
          </div>

          {/* Quick Action 버튼 */}
          <div style={{ display: "flex", gap: 5 }}>
            {([
              { label: "▶ Run",     color: T.active, fn: handleRun },
              { label: "↺ Restart", color: T.accent, fn: handleRestart },
              { label: "■ Kill",    color: T.error,  fn: handleKill },
            ] as const).map((btn) => (
              <button
                key={btn.label}
                onClick={btn.fn}
                style={{
                  flex: 1, padding: "4px 4px",
                  fontSize: 9, fontWeight: 700,
                  color: btn.color, cursor: "pointer",
                  background: `${btn.color}14`,
                  border: `1px solid ${btn.color}30`,
                  borderRadius: 5, transition: "all 0.1s",
                  whiteSpace: "nowrap",
                }}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {actionMsg && (
            <div style={{ fontSize: 9, color: T.accent, marginTop: 5, textAlign: "center" }}>
              {actionMsg}
            </div>
          )}

          {/* Raw JSON 토글 */}
          <button
            onClick={() => setRawJsonOpen((v) => !v)}
            style={{
              marginTop: 6, width: "100%", padding: "3px 6px",
              fontSize: 9, color: T.text3, cursor: "pointer",
              background: rawJsonOpen ? `${T.accent}10` : "transparent",
              border: `1px solid ${T.border}`,
              borderRadius: 4, textAlign: "left", transition: "all 0.1s",
            }}
          >
            {rawJsonOpen ? "▲ Raw JSON 닫기" : "▼ Raw JSON 보기"}
          </button>
          {rawJsonOpen && (
            <pre style={{
              marginTop: 4, padding: "6px 8px",
              fontSize: 8, color: T.text3, lineHeight: 1.5,
              background: T.bg, border: `1px solid ${T.border}`,
              borderRadius: 4, overflowX: "auto", maxHeight: 140,
              fontFamily: '"JetBrains Mono", "Fira Code", monospace',
              whiteSpace: "pre",
            }}>
              {JSON.stringify(selectedAgent, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* ── 세션 진행 요약 ── */}
      {sessionStats && (sessionStats.userCount > 0 || sessionStats.agentCount > 0) && (
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
          <div style={sectionLabel}>세션 진행 상황</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: sessionStats.firstTask ? 6 : 0 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 4,
              background: "rgba(139,92,246,0.1)", borderRadius: 10,
              padding: "3px 8px", border: "1px solid rgba(139,92,246,0.15)",
            }}>
              <span style={{ fontSize: 10 }}>💬</span>
              <span style={{ fontSize: 10, color: "#C4B5FD" }}>{sessionStats.userCount}개 요청</span>
            </div>
            {sessionStats.agentCount > 0 && (
              <div style={{
                display: "flex", alignItems: "center", gap: 4,
                background: `${T.active}14`, borderRadius: 10,
                padding: "3px 8px", border: `1px solid ${T.active}25`,
              }}>
                <span style={{ fontSize: 10 }}>🤖</span>
                <span style={{ fontSize: 10, color: T.active }}>{sessionStats.agentCount}개 에이전트</span>
              </div>
            )}
            {sessionStats.toolCount > 0 && (
              <div style={{
                display: "flex", alignItems: "center", gap: 4,
                background: `${T.pending}14`, borderRadius: 10,
                padding: "3px 8px", border: `1px solid ${T.pending}25`,
              }}>
                <span style={{ fontSize: 10 }}>⚙️</span>
                <span style={{ fontSize: 10, color: T.pending }}>{sessionStats.toolCount}회 도구</span>
              </div>
            )}
          </div>
          {sessionStats.firstTask && (
            <div style={{ fontSize: 10, color: T.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
              📋 {sessionStats.firstTask}
            </div>
          )}
        </div>
      )}

      {/* ── 에이전트 상태 ── */}
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={sectionLabel}>에이전트 상태</div>

        {activeAgents.map((agent) => (
          <div key={agent.id} style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.active, boxShadow: `0 0 6px ${T.active}80`, flexShrink: 0, marginTop: 3, animation: "pulse-glow 2s ease-in-out infinite" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: T.text1, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {agent.icon} {agent.name}
              </div>
              {agent.currentTask && (
                <div style={{ fontSize: 9, color: T.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                  {agent.currentTask}
                </div>
              )}
            </div>
            <Badge status="active" label="Active" />
          </div>
        ))}

        {doneAgents.map((agent) => (
          <div key={agent.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 0" }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: T.accent, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: T.text2, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {agent.icon} {agent.name}
            </span>
            <Badge status="pending" label="Done" />
          </div>
        ))}

        {idleAgents.map((agent) => (
          <div key={agent.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 0" }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: agent.status === "error" ? T.error : T.border, flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: agent.status === "error" ? T.error : T.text3, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {agent.icon} {agent.name}
            </span>
            {agent.status === "error" && <Badge status="error" label="Error" />}
          </div>
        ))}
      </div>

      {/* ── 파일 미리보기 ── */}
      {(hasActiveAgent || previewFile) && previewLines && (
        <div style={{ borderBottom: `1px solid ${T.border}`, flexShrink: 0, maxHeight: 160, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "6px 14px 4px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div style={sectionLabel}>{previewLoading ? "파일 로드 중..." : "작업 중인 파일"}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {hasActiveAgent && <div style={{ width: 5, height: 5, borderRadius: "50%", background: T.active, animation: "pulse-glow 2s ease-in-out infinite" }} />}
              <button
                onClick={() => setPreviewFile(null)}
                style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 10, padding: "1px 3px" }}
              >
                ✕
              </button>
            </div>
          </div>
          {fileName && (
            <div style={{ padding: "0 14px 4px", fontSize: 9, color: T.accent, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {fileName}
            </div>
          )}
          <div style={{ overflowY: "auto", flex: 1 }}>
            <pre style={{
              margin: 0, padding: "4px 14px 8px",
              fontSize: 9, lineHeight: 1.5, color: T.text3,
              fontFamily: '"JetBrains Mono", "Fira Code", monospace',
              whiteSpace: "pre-wrap", wordBreak: "break-all",
            }}>
              {previewLines}
            </pre>
          </div>
        </div>
      )}

      {/* ── 탭 바 + 탭별 콘텐츠 (Logs / Timeline / Preview) ── */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>

        {/* 탭 버튼 행 */}
        <div style={{ display: "flex", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
          {(["logs", "timeline", ...(showPreviewTab !== false ? ["preview"] : [])] as RightTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setRightTab(tab)}
              style={{
                flex: 1, padding: "7px 4px",
                fontSize: 10, fontWeight: rightTab === tab ? 700 : 400,
                background: rightTab === tab ? `${T.accent}14` : "transparent",
                color: rightTab === tab ? T.accent : T.text3,
                border: "none",
                borderBottom: rightTab === tab ? `2px solid ${T.accent}` : "2px solid transparent",
                cursor: "pointer", transition: "all 0.12s",
              }}
            >
              {tab === "logs" ? "Logs" : tab === "timeline" ? "🕒 Timeline" : "Preview"}
            </button>
          ))}
        </div>

        {/* ── Logs 탭 ── */}
        {rightTab === "logs" && (
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {/* 로그 헤더 */}
            <div style={{
              padding: "7px 14px 5px", flexShrink: 0,
              borderBottom: `1px solid ${logHeaderFlash ? "#EF4444" : T.border}`,
              transition: "border-color 0.3s ease",
              background: logHeaderFlash ? "#EF44440A" : "transparent",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                <div style={sectionLabel}>
                  {selectedAgent ? `${selectedAgent.name} 로그` : "실시간 로그"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {displayLogs.length > 0 && (
                    <span style={{ fontSize: 9, color: T.text3 }}>{displayLogs.length}</span>
                  )}
                  {/* Auto Scroll 토글 */}
                  <button
                    onClick={() => setAutoScroll((v) => !v)}
                    title={autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
                    style={{
                      fontSize: 9, fontWeight: 700, padding: "1px 6px",
                      borderRadius: 4, border: "none", cursor: "pointer",
                      background: autoScroll ? `${T.active}22` : "transparent",
                      color: autoScroll ? T.active : T.text3,
                      outline: autoScroll ? `1px solid ${T.active}40` : `1px solid ${T.border}`,
                      transition: "all 0.15s",
                    }}
                  >
                    ↓ {autoScroll ? "ON" : "OFF"}
                  </button>
                </div>
              </div>
              {/* 레벨 필터 Pills */}
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {LOG_FILTER_PILLS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setLogFilter(p.key)}
                    style={{
                      padding: "2px 7px", borderRadius: 999,
                      fontSize: 9, fontWeight: 600, cursor: "pointer",
                      border: "none", transition: "all 0.12s",
                      background: logFilter === p.key ? `${p.color}22` : "transparent",
                      color: logFilter === p.key ? p.color : T.text3,
                      outline: logFilter === p.key ? `1px solid ${p.color}40` : "1px solid transparent",
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            {/* 로그 리스트 */}
            <div
              ref={logsContainerRef}
              style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}
            >
              {displayLogs.length === 0 ? (
                <div style={{ color: T.border, fontSize: 10, padding: "10px 14px" }}>로그 없음</div>
              ) : (
                displayLogs.map((log) => {
                  const color = LEVEL_COLOR[log.level];
                  const bg    = LEVEL_BG[log.level];
                  return (
                    <div
                      key={log.id}
                      style={{
                        fontSize: 10, lineHeight: 1.5,
                        padding: "6px 14px",
                        background: bg,
                        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                        borderLeft: log.level === "ERROR" ? `2px solid ${T.error}` : "2px solid transparent",
                        transition: "background 0.1s",
                        cursor: "default",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.025)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = bg;
                      }}
                    >
                      <span style={{ fontSize: 8, color: T.text3, marginRight: 4, letterSpacing: "0.02em" }}>
                        {log.time}
                      </span>
                      <span style={{
                        display: "inline-block",
                        fontSize: 8, fontWeight: 700,
                        color, background: `${color}20`,
                        border: `1px solid ${color}30`,
                        borderRadius: 3, padding: "0px 4px",
                        marginRight: 5, lineHeight: 1.6,
                      }}>
                        {log.level}
                      </span>
                      <span style={{ color: T.text2, wordBreak: "break-all" }}>
                        {log.msg}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ── Timeline 탭 ── */}
        {rightTab === "timeline" && (
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {/* 헤더: 확장 시 배경 #141821 + "Execution Timeline (Debug Mode)" */}
            <div style={{
              padding: "7px 14px 5px", flexShrink: 0,
              background: timelineExpanded ? "#141821" : "transparent",
              transition: "background 150ms ease",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              borderBottom: `1px solid ${T.border}`,
            }}>
              <div style={sectionLabel}>
                {timelineExpanded ? "Execution Timeline (Debug Mode)" : "Execution Timeline"}
              </div>
              <button
                onClick={() => setTimelineExpanded((v) => !v)}
                title="Ctrl+Shift+T"
                style={{
                  fontSize: 9,
                  color: timelineExpanded ? T.accent : T.text3,
                  background: timelineExpanded ? `${T.accent}14` : "none",
                  border: `1px solid ${timelineExpanded ? T.accent : T.border}`,
                  borderRadius: 3, padding: "1px 6px", cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {timelineExpanded ? "↑ 축소" : "↓ 확장"}
              </button>
            </div>
            {/* 타임라인 이벤트 목록 — maxHeight 애니메이션 */}
            <div style={{
              maxHeight: timelineExpanded ? 600 : 140,
              overflow: "auto",
              transition: "max-height 150ms ease",
              background: timelineExpanded ? "#141821" : "transparent",
            }}>
              {timelineEvents.length === 0 ? (
                <div style={{ color: T.border, fontSize: 10, padding: "10px 14px" }}>
                  이벤트 없음 — 에이전트를 실행해보세요
                </div>
              ) : (
                timelineEvents.map((log, i) => {
                  const color = LEVEL_COLOR[log.level as keyof typeof LEVEL_COLOR] ?? "#6B7280";
                  const icon = log.level === "SUCCESS" ? "✓"
                    : log.level === "ERROR" ? "✕"
                    : log.level === "WARN"  ? "⚠"
                    : log.level === "ROUTE" ? "⌗"
                    : "›";
                  return (
                    <div key={log.id} style={{ padding: "6px 14px", display: "flex", alignItems: "flex-start", gap: 8, position: "relative" }}>
                      {/* 세로 연결선 */}
                      {i < timelineEvents.length - 1 && (
                        <div style={{ position: "absolute", left: 20, top: 20, bottom: -6, width: 1, background: T.border, zIndex: 0 }} />
                      )}
                      {/* 이벤트 아이콘 */}
                      <div style={{
                        width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
                        background: `${color}20`, border: `1px solid ${color}60`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 7, color, fontWeight: 700, marginTop: 1, zIndex: 1,
                      }}>
                        {icon}
                      </div>
                      {/* 이벤트 내용 */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, color: T.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {log.msg}
                        </div>
                        {log.agentId && (
                          <div style={{ fontSize: 8, color, marginTop: 1 }}>{log.agentId}</div>
                        )}
                      </div>
                      <div style={{ fontSize: 8, color: T.text3, flexShrink: 0, marginTop: 1 }}>{log.time}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ── Preview 탭 ── */}
        {rightTab === "preview" && showPreviewTab !== false && (
          <div style={{ flex: 1, overflowY: "auto", background: "#0F1218", padding: 16 }}>
            <div style={{
              fontSize: 9, color: T.text3, marginBottom: 10,
              textTransform: "uppercase", letterSpacing: "0.07em",
            }}>
              Preview Mode
            </div>
            {!previewContent ? (
              <div style={{ color: T.text3, fontSize: 11, textAlign: "center", marginTop: 40 }}>
                에이전트 응답 대기 중...
              </div>
            ) : (() => {
              const type = detectPreviewType(previewContent);
              // 이미지 URL
              if (type === "image") {
                return <img src={previewContent.trim()} alt="preview" style={{ maxWidth: "100%", borderRadius: 8 }} />;
              }
              // HTML → iframe sandbox
              if (type === "html") {
                return (
                  <iframe
                    srcDoc={previewContent}
                    sandbox="allow-same-origin"
                    style={{ width: "100%", minHeight: 300, border: `1px solid ${T.border}`, borderRadius: 6, background: "#fff" }}
                  />
                );
              }
              // JSON → pretty print
              if (type === "json") {
                let pretty = previewContent;
                try { pretty = JSON.stringify(JSON.parse(previewContent), null, 2); } catch { /* keep original */ }
                return (
                  <pre style={{ fontSize: 11, color: "#22C55E", fontFamily: '"JetBrains Mono", monospace', lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                    {pretty}
                  </pre>
                );
              }
              // Markdown → marked 렌더
              if (type === "markdown") {
                const html = renderMarkdown(previewContent);
                return (
                  <div
                    className="markdown-body"
                    style={{ fontSize: 13, color: "#E6EDF3", lineHeight: 1.6 }}
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                );
              }
              // Code fallback
              return (
                <pre style={{
                  fontSize: 11, color: "#E6EDF3",
                  fontFamily: '"JetBrains Mono", monospace',
                  lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-all",
                  background: "#0A0E14", padding: 12, borderRadius: 6,
                  border: `1px solid ${T.border}`,
                }}>
                  {previewContent}
                </pre>
              );
            })()}
          </div>
        )}

      </div>

      {/* ── 변경된 파일 ── */}
      {changedFiles.length > 0 && (
        <div style={{ borderTop: `1px solid ${T.border}`, padding: "8px 14px", flexShrink: 0 }}>
          <div style={{ ...sectionLabel, marginBottom: 5 }}>
            변경된 파일 ({changedFiles.length})
          </div>
          {changedFiles.slice(0, 8).map((f, i) => (
            <div
              key={i}
              title={f.path}
              onClick={() => f.action !== "delete" && fetchPreview(f.path)}
              style={{
                fontSize: 10,
                color: previewFile?.path === f.path ? "#A78BFA" : f.action === "create" ? "#34D399" : f.action === "delete" ? T.error : T.text2,
                marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                display: "flex", alignItems: "center", gap: 4,
                cursor: f.action !== "delete" ? "pointer" : "default",
                background: previewFile?.path === f.path ? "rgba(139,92,246,0.08)" : "transparent",
                borderRadius: 3, padding: "1px 3px",
              }}
            >
              <span style={{ fontSize: 9, flexShrink: 0 }}>{f.action === "create" ? "＋" : f.action === "delete" ? "－" : "～"}</span>
              <span>{f.path.split(/[/\\]/).pop()}</span>
            </div>
          ))}
          {changedFiles.length > 8 && (
            <div style={{ fontSize: 9, color: T.text3, marginTop: 2 }}>+{changedFiles.length - 8}개 더...</div>
          )}
        </div>
      )}
    </div>
  );
}
