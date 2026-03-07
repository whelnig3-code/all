"use client";
// UI 리팩토링: 운영 콘솔형 + T 토큰 적용 + useReducer 상태 관리
import { useState, useReducer, useEffect, useCallback, useMemo } from "react";
import Sidebar from "@/components/layout/Sidebar";
import AgentBar from "@/components/layout/AgentBar";
import ChatArea from "@/components/chat/ChatArea";
import RightPanel from "@/components/layout/RightPanel";
import TerminalPanel from "@/components/terminal/TerminalPanel";
import SettingsPanel from "@/components/settings/SettingsPanel";
import AgentTeamPanel from "@/components/agents/AgentTeamPanel";
import WorkflowPanel from "@/components/workflow/WorkflowPanel";
import CommandPalette from "@/components/common/CommandPalette";
import FileExplorer from "@/components/files/FileExplorer";
import CodeEditorPanel from "@/components/editor/CodeEditorPanel";
import ProjectSetupPanel from "@/components/setup/ProjectSetupPanel";
import TodoPanel from "@/components/todo/TodoPanel";
import { useAgentStatus } from "@/hooks/useAgentStatus";
import { AgentStatus } from "@/types";
import { AGENTS_CONFIG } from "@/config/agents";
import { renderMarkdown } from "@/lib/utils/markdown";
import ErrorBoundary from "@/components/common/ErrorBoundary";
import MobileHeader from "@/components/layout/MobileHeader";
import { T } from "@/lib/ui-tokens";
import { KpiCard } from "@/components/ui/KpiCard";
import {
  uiReducer, initialUIState,
  dataReducer, initialDataState,
  agentReducer, initialAgentState,
} from "@/lib/reducers";

export default function Dashboard() {
  // 3개 리듀서로 20개 useState 통합 — 오케스트라 지휘자처럼 각 섹션(UI/데이터/에이전트)을 독립 관리
  const [uiState, uiDispatch] = useReducer(uiReducer, initialUIState);
  const [dataState, dataDispatch] = useReducer(dataReducer, initialDataState);
  const [agentState, agentDispatch] = useReducer(agentReducer, initialAgentState);

  // Destructure for convenient access in JSX — 변수명 유지로 하위 컴포넌트 영향 최소화
  const {
    activeTab, sidebarCollapsed: collapsed, showCommandPalette,
    showCreateProjectModal, deletingProjectId, windowWidth,
    editorFilePath, selectedAgentId,
  } = uiState;
  const {
    projects, activeProjectId, conversations,
    activeConversationId, isConversationsLoading,
  } = dataState;
  const {
    isAgentProcessing, pendingTargetAgent, pendingWorkflowAgents,
    previewContent, routingLog, sessionStats,
  } = agentState;

  // 반응형 브레이크포인트
  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 900;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // 900px 미만이거나 파일/에디터 탭일 때 RightPanel 숨김
  const showRightPanel = windowWidth >= 900 && activeTab !== "files" && activeTab !== "editor";

  // 반응형 너비 계산 (21:9 / 16:9 / 16:9 small)
  const isUltraWide = windowWidth >= 2200;  // 21:9 (2560×1080, 3440×1440 등)
  const isWide = windowWidth >= 1500;       // 16:9 large (1920×1080+)
  // 21:9에서 우측 패널 넓게, 채팅 영역 최대 활용
  const rightPanelWidth = isUltraWide ? 520 : isWide ? 360 : 280;
  const chatMaxWidth = isUltraWide ? 1600 : isWide ? 1080 : 860;

  // 모바일: 탭 변경 시 사이드바 자동 닫기
  useEffect(() => {
    if (isMobile) setMobileMenuOpen(false);
  }, [activeTab, isMobile]);

  useEffect(() => {
    const handleResize = () => uiDispatch({ type: "SET_WINDOW_WIDTH", payload: window.innerWidth });
    uiDispatch({ type: "SET_WINDOW_WIDTH", payload: window.innerWidth });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        uiDispatch({ type: "TOGGLE_COMMAND_PALETTE" });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // 초기 에이전트 목록 (config에서 가져옴) — useMemo로 참조 고정 (매 렌더마다 재생성 방지)
  // useAgentStatus의 useEffect([initialAgents])가 setAgents(idle)로 리셋하는 버그 차단
  const initialAgents = useMemo(
    () => Object.values(AGENTS_CONFIG).map((config) => ({
      ...config,
      status: "idle" as AgentStatus,
    })),
    [] // 마운트 시 1회만 생성
  );

  // setAgents: ChatArea SSE 이벤트로 WebSocket 없이도 AgentBar/RightPanel 실시간 반영
  const { agents, setAgents, connectionStatus, changedFiles, agentLogs } =
    useAgentStatus(initialAgents);

  // 프로젝트 목록 로드
  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => {
        dataDispatch({ type: "SET_PROJECTS", payload: data.projects ?? [] });
        if (data.projects?.length > 0) {
          dataDispatch({ type: "SET_ACTIVE_PROJECT_ID", payload: data.projects[0].id });
        }
      })
      .catch(() => {});

    const timer = setInterval(() => {
      fetch("/api/projects")
        .then((d) => d.json())
        .then((d) => { dataDispatch({ type: "SET_PROJECTS", payload: d.projects ?? [] }); })
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(timer);
  }, []);

  // 대화 목록 로드 — 초기에는 새 채팅창(null)으로 시작, 사이드바에서 직접 선택
  useEffect(() => {
    dataDispatch({ type: "SET_CONVERSATIONS_LOADING", payload: true });
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((data) => {
        dataDispatch({ type: "SET_CONVERSATIONS", payload: data.conversations ?? [] });
        // ✅ 초기 자동 선택 없음: activeConversationId = null 유지
        // → ChatArea가 "JM Agent Team — 무엇을 도와드릴까요?" 웰컴 화면 표시
        // → 사이드바에서 이전 대화를 클릭하거나 바로 메시지 입력으로 새 대화 시작 가능
      })
      .catch(() => {})
      .finally(() => dataDispatch({ type: "SET_CONVERSATIONS_LOADING", payload: false }));

    const timer = setInterval(() => {
      fetch("/api/conversations")
        .then((d) => d.json())
        .then((d) => dataDispatch({ type: "SET_CONVERSATIONS", payload: d.conversations ?? [] }))
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  // 에이전트 상태는 useAgentStatus 훅이 WebSocket으로 실시간 관리

  // KPI 통계: 1회 O(n) 순회로 4개 상태 카운트 (4x filter 방지)
  const kpiStats = useMemo(() => {
    const counts = { active: 0, done: 0, error: 0, idle: 0 };
    for (const a of agents) {
      if (a.status in counts) counts[a.status as keyof typeof counts]++;
    }
    return counts;
  }, [agents]);

  const activeProject = projects.find((p) => p.id === activeProjectId);

  const refreshConversations = async () => {
    const data = await fetch("/api/conversations").then((r) => r.json()).catch(() => ({ conversations: [] }));
    dataDispatch({ type: "SET_CONVERSATIONS", payload: data.conversations ?? [] });
  };

  const handleNewConversation = async () => {
    try {
      const data = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: activeProjectId, title: "새 대화" }),
      }).then((r) => r.json());
      dataDispatch({ type: "ADD_CONVERSATION", payload: data.conversation });
      dataDispatch({ type: "SET_ACTIVE_CONVERSATION_ID", payload: data.conversation.id });
    } catch {}
  };

  const handleAutoNewConversation = async (): Promise<string> => {
    const data = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: activeProjectId, title: "새 대화" }),
    }).then((r) => r.json());
    dataDispatch({ type: "ADD_CONVERSATION", payload: data.conversation });
    dataDispatch({ type: "SET_ACTIVE_CONVERSATION_ID", payload: data.conversation.id });
    return data.conversation.id;
  };

  const handleDeleteConversation = async (id: string) => {
    await fetch(`/api/conversations/${id}`, { method: "DELETE" }).catch(() => {});
    // dataReducer DELETE_CONVERSATION handles: remove from list + clear activeConversationId if matching
    dataDispatch({ type: "DELETE_CONVERSATION", payload: id });
  };

  const handleCreateProject = async (data: {
    name: string;
    icon: string;
    description: string;
    path: string;
  }) => {
    try {
      const result = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json());
      dataDispatch({ type: "ADD_PROJECT", payload: result.project });
      uiDispatch({ type: "SET_CREATE_PROJECT_MODAL", payload: false });
    } catch {}
  };

  const handleDeleteProject = async (id: string) => {
    await fetch(`/api/projects/${id}`, { method: "DELETE" }).catch(() => {});
    // dataReducer DELETE_PROJECT handles: remove project + clear activeProjectId + filter related conversations
    dataDispatch({ type: "DELETE_PROJECT", payload: id });
    uiDispatch({ type: "SET_DELETING_PROJECT_ID", payload: null });
  };

  const handleRenameConversation = async (id: string, title: string) => {
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }).catch(() => {});
    dataDispatch({ type: "RENAME_CONVERSATION", payload: { id, title } });
  };

  const handleRenameProject = async (id: string, name: string) => {
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => {});
    dataDispatch({ type: "RENAME_PROJECT", payload: { id, name } });
  };

  // 대화 제목 자동 업데이트 (첫 메시지 기반)
  const handleAutoTitleUpdate = async (conversationId: string, firstMessage: string) => {
    const title = firstMessage.trim().slice(0, 35) + (firstMessage.length > 35 ? "..." : "");
    await handleRenameConversation(conversationId, title);
  };

  // 세션 통계 콜백 — useCallback으로 참조 안정화 (ChatArea useEffect 의존성)
  const handleSessionStatsChange = useCallback(
    (stats: { userCount: number; agentCount: number; toolCount: number; firstTask?: string }) => {
      agentDispatch({ type: "SET_SESSION_STATS", payload: stats });
    },
    []
  );

  // 현재 활성 대화 제목 (Context Path용)
  const activeConversationTitle = conversations.find((c) => c.id === activeConversationId)?.title;

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        background: T.bg,
        color: T.text1,
      }}
    >
      {/* 커맨드 팔레트 */}
      {showCommandPalette && (
        <CommandPalette
          agents={agents}
          onSelectAgent={(agentId) => {
            agentDispatch({ type: "SET_PENDING_TARGET_AGENT", payload: agentId });
            uiDispatch({ type: "SET_COMMAND_PALETTE", payload: false });
            uiDispatch({ type: "SET_ACTIVE_TAB", payload: "chat" });
          }}
          onClose={() => uiDispatch({ type: "SET_COMMAND_PALETTE", payload: false })}
        />
      )}

      {/* 프로젝트 생성 모달 */}
      {showCreateProjectModal && (
        <ProjectSetupPanel
          onClose={() => uiDispatch({ type: "SET_CREATE_PROJECT_MODAL", payload: false })}
          onCreate={handleCreateProject}
        />
      )}

      {/* 프로젝트 삭제 확인 모달 */}
      {deletingProjectId && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: T.card,
              border: `1px solid ${T.border}`,
              borderRadius: 12,
              padding: 24,
              maxWidth: 360,
              width: "90%",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: T.text1 }}>
              프로젝트 삭제
            </div>
            <div style={{ color: T.text2, marginBottom: 20, fontSize: 13 }}>
              이 프로젝트와 관련된 모든 대화가 삭제됩니다. 계속하시겠습니까?
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => uiDispatch({ type: "SET_DELETING_PROJECT_ID", payload: null })}
                style={{
                  padding: "6px 16px",
                  borderRadius: 6,
                  border: `1px solid ${T.border}`,
                  background: "transparent",
                  color: T.text2,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                취소
              </button>
              <button
                onClick={() => handleDeleteProject(deletingProjectId)}
                style={{
                  padding: "6px 16px",
                  borderRadius: 6,
                  border: "none",
                  background: "#EF4444",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 모바일: 사이드바 오버레이 + 백드롭 ── */}
      {isMobile && mobileMenuOpen && (
        <>
          {/* 백드롭 */}
          <div
            onClick={() => setMobileMenuOpen(false)}
            style={{
              position: "fixed", inset: 0,
              background: "rgba(0,0,0,0.5)",
              zIndex: 998,
            }}
          />
          {/* 오버레이 사이드바 */}
          <div style={{
            position: "fixed", top: 0, left: 0, bottom: 0,
            width: 260, zIndex: 999,
          }}>
            <ErrorBoundary label="Sidebar">
              <Sidebar
                activeTab={activeTab}
                setActiveTab={(tab: string) => { uiDispatch({ type: "SET_ACTIVE_TAB", payload: tab }); setMobileMenuOpen(false); }}
                collapsed={false}
                setCollapsed={() => setMobileMenuOpen(false)}
                projects={projects}
                activeProjectId={activeProjectId}
                setActiveProjectId={(id) => {
                  dataDispatch({ type: "SET_ACTIVE_PROJECT_ID", payload: id });
                  uiDispatch({ type: "SET_ACTIVE_TAB", payload: "projects" });
                  setMobileMenuOpen(false);
                }}
                conversations={conversations}
                activeConversationId={activeConversationId}
                setActiveConversationId={(id) => {
                  dataDispatch({ type: "SET_ACTIVE_CONVERSATION_ID", payload: id });
                  uiDispatch({ type: "SET_ACTIVE_TAB", payload: "chat" });
                  setMobileMenuOpen(false);
                }}
                onNewConversation={() => { handleNewConversation(); setMobileMenuOpen(false); }}
                onDeleteConversation={handleDeleteConversation}
                onRenameConversation={handleRenameConversation}
                onCreateProject={() => uiDispatch({ type: "SET_CREATE_PROJECT_MODAL", payload: true })}
                onDeleteProject={(id) => uiDispatch({ type: "SET_DELETING_PROJECT_ID", payload: id })}
                onRenameProject={handleRenameProject}
                isConversationsLoading={isConversationsLoading}
              />
            </ErrorBoundary>
          </div>
        </>
      )}

      {/* ── 데스크톱/태블릿: 고정 사이드바 ── */}
      {!isMobile && (
        <ErrorBoundary label="Sidebar">
          <Sidebar
            activeTab={activeTab}
            setActiveTab={(tab: string) => uiDispatch({ type: "SET_ACTIVE_TAB", payload: tab })}
            collapsed={isTablet ? true : collapsed}
            setCollapsed={(val: boolean) => uiDispatch({ type: "SET_SIDEBAR_COLLAPSED", payload: val })}
            projects={projects}
            activeProjectId={activeProjectId}
            setActiveProjectId={(id) => {
              dataDispatch({ type: "SET_ACTIVE_PROJECT_ID", payload: id });
              uiDispatch({ type: "SET_ACTIVE_TAB", payload: "projects" });
            }}
            conversations={conversations}
            activeConversationId={activeConversationId}
            setActiveConversationId={(id) => {
              dataDispatch({ type: "SET_ACTIVE_CONVERSATION_ID", payload: id });
              uiDispatch({ type: "SET_ACTIVE_TAB", payload: "chat" });
            }}
            onNewConversation={handleNewConversation}
            onDeleteConversation={handleDeleteConversation}
            onRenameConversation={handleRenameConversation}
            onCreateProject={() => uiDispatch({ type: "SET_CREATE_PROJECT_MODAL", payload: true })}
            onDeleteProject={(id) => uiDispatch({ type: "SET_DELETING_PROJECT_ID", payload: id })}
            onRenameProject={handleRenameProject}
            isConversationsLoading={isConversationsLoading}
          />
        </ErrorBoundary>
      )}

      {/* ── 중앙 + 오른쪽 패널 ── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        {/* 모바일 헤더 (햄버거 + 타이틀 + 연결 상태) */}
        {isMobile && (
          <MobileHeader
            onMenuToggle={() => setMobileMenuOpen((prev) => !prev)}
            connectionStatus={connectionStatus}
          />
        )}

        {/* 상단 에이전트 상태바 */}
        <ErrorBoundary label="AgentBar">
          <AgentBar
            agents={agents}
            connectionStatus={connectionStatus}
            isProcessing={isAgentProcessing}
            compact={isMobile}
          />
        </ErrorBoundary>

        {/* KPI 카드 행 — 에이전트 상태 요약 */}
        <div style={{
          padding: isMobile ? "8px 12px" : "12px 20px",
          background: T.bg,
          borderBottom: `1px solid ${T.border}`,
          flexShrink: 0,
        }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
            gap: isMobile ? 8 : 12,
            maxWidth: 1600,
            margin: "0 auto",
          }}>
            <KpiCard label="Active" value={kpiStats.active} accent={T.active} />
            <KpiCard label="Done"   value={kpiStats.done}   accent={T.accent} />
            <KpiCard label="Error"  value={kpiStats.error}  accent={T.error} />
            <KpiCard label="Idle"   value={kpiStats.idle}   accent={T.text2} />
          </div>
        </div>

        {/* 메인 콘텐츠 영역 */}
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          {/* 탭별 콘텐츠 — 각 섹션을 ErrorBoundary로 격리 */}
          {activeTab === "todo" ? (
            <ErrorBoundary label="Todo">
              <TodoPanel />
            </ErrorBoundary>
          ) : activeTab === "terminal" ? (
            <ErrorBoundary label="Terminal">
              <TerminalPanel />
            </ErrorBoundary>
          ) : activeTab === "settings" ? (
            <ErrorBoundary label="Settings">
              <SettingsPanel />
            </ErrorBoundary>
          ) : activeTab === "setup" ? (
            <ErrorBoundary label="ProjectSetup">
              <ProjectSetupPanel onClose={() => uiDispatch({ type: "SET_ACTIVE_TAB", payload: "chat" })} onCreate={handleCreateProject} />
            </ErrorBoundary>
          ) : activeTab === "agents" ? (
            <ErrorBoundary label="AgentTeam">
              <AgentTeamPanel
                agents={agents}
                onRunWorkflow={(agentIds) => {
                  agentDispatch({ type: "SET_PENDING_WORKFLOW_AGENTS", payload: agentIds });
                  uiDispatch({ type: "SET_ACTIVE_TAB", payload: "chat" });
                }}
                onAgentSelect={(agentId) => {
                  uiDispatch({ type: "SET_SELECTED_AGENT_ID", payload: agentId });
                }}
                selectedAgentId={selectedAgentId}
              />
            </ErrorBoundary>
          ) : activeTab === "workflow" ? (
            <ErrorBoundary label="Workflow">
              <WorkflowPanel
                onRunWorkflow={(agentIds) => {
                  agentDispatch({ type: "SET_PENDING_WORKFLOW_AGENTS", payload: agentIds });
                  uiDispatch({ type: "SET_ACTIVE_TAB", payload: "chat" });
                }}
              />
            </ErrorBoundary>
          ) : activeTab === "files" ? (
            <ErrorBoundary label="FileExplorer">
              <FileExplorer
                changedFiles={changedFiles}
                onOpenInEditor={(filePath) => {
                  uiDispatch({ type: "SET_EDITOR_FILE_PATH", payload: filePath });
                  uiDispatch({ type: "SET_ACTIVE_TAB", payload: "editor" });
                }}
              />
            </ErrorBoundary>
          ) : activeTab === "editor" ? (
            <ErrorBoundary label="CodeEditor">
              <CodeEditorPanel
                initialFilePath={editorFilePath}
                onFilePathChange={(path) => uiDispatch({ type: "SET_EDITOR_FILE_PATH", payload: path })}
                changedFiles={changedFiles}
              />
            </ErrorBoundary>
          ) : activeTab === "projects" ? (
            <ErrorBoundary label="Projects">
              <div
                style={{
                  flex: 1,
                  padding: 24,
                  overflowY: "auto",
                  color: "#9CA3AF",
                  fontSize: 14,
                }}
              >
                <div style={{ marginBottom: 16, fontSize: 16, fontWeight: 600, color: "#F9FAFB" }}>
                  프로젝트 워크스페이스
                </div>
                {activeProject ? (
                  <div>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>{activeProject.icon}</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: "#F9FAFB", marginBottom: 4 }}>
                      {activeProject.name}
                    </div>
                    <div style={{ color: "#6B7280", marginBottom: 12 }}>{activeProject.description}</div>
                    <div style={{ color: "#4B5563", fontSize: 12, fontFamily: "monospace" }}>
                      {activeProject.path}
                    </div>
                  </div>
                ) : (
                  <div>활성 프로젝트가 없습니다.</div>
                )}
              </div>
            </ErrorBoundary>
          ) : (
            // 기본: AI 채팅
            <ErrorBoundary label="Chat">
              <ChatArea
                projectName={
                  activeProject
                    ? `${activeProject.icon} ${activeProject.name}`
                    : undefined
                }
                conversationTitle={activeConversationTitle}
                conversationId={activeConversationId}
                onConversationUpdate={refreshConversations}
                onAutoNewConversation={handleAutoNewConversation}
                onAgentStatusChange={(agentId, status, currentTask) => {
                  setAgents((prev) =>
                    prev.map((a) =>
                      a.id === agentId
                        ? { ...a, status, currentTask: currentTask ?? a.currentTask }
                        : a
                    )
                  );
                  // done 상태 후 4초 뒤 idle로 자동 전환
                  if (status === "done") {
                    setTimeout(() => {
                      setAgents((prev) =>
                        prev.map((a) =>
                          a.id === agentId && a.status === "done"
                            ? { ...a, status: "idle", currentTask: undefined }
                            : a
                        )
                      );
                    }, 4000);
                  }
                }}
                externalTargetAgent={pendingTargetAgent}
                onExternalTargetAgentClear={() => agentDispatch({ type: "SET_PENDING_TARGET_AGENT", payload: null })}
                initialTeamAgents={pendingWorkflowAgents}
                onTeamAgentsClear={() => agentDispatch({ type: "SET_PENDING_WORKFLOW_AGENTS", payload: null })}
                onLoadingChange={(val) => agentDispatch({ type: "SET_AGENT_PROCESSING", payload: val })}
                maxMessageWidth={chatMaxWidth}
                onAutoTitleUpdate={handleAutoTitleUpdate}
                onSessionStatsChange={handleSessionStatsChange}
                onPreviewContent={(content) => agentDispatch({ type: "SET_PREVIEW_CONTENT", payload: content })}
                onRoutingEvent={(evt) => agentDispatch({ type: "ADD_ROUTING_EVENT", payload: evt })}
                projectDefaultAgent={activeProject?.defaultAgent}
              />
            </ErrorBoundary>
          )}

          {/* 21:9 전용 Preview 컬럼 — window.innerWidth > 2200 시 자동 표시 */}
          {isUltraWide && activeTab === "chat" && (
            <div style={{
              flex: "0 0 35%",
              borderLeft: `1px solid ${T.border}`,
              background: "#0F1218",
              display: "flex", flexDirection: "column",
              overflow: "hidden", flexShrink: 0,
            }}>
              <div style={{
                padding: "8px 16px 6px",
                borderBottom: `1px solid ${T.border}`,
                fontSize: 9, color: "#6B7280",
                textTransform: "uppercase", letterSpacing: "0.07em",
                flexShrink: 0,
              }}>
                Preview — 21:9 Split
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
                {!previewContent ? (
                  <div style={{ color: "#4B5563", fontSize: 11, textAlign: "center", marginTop: 60 }}>
                    에이전트 응답이 완료되면 여기에 표시됩니다
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 9, color: "#4B5563", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                      Preview Mode
                    </div>
                    <div
                      className="markdown-body"
                      style={{ fontSize: 13, color: "#E6EDF3", lineHeight: 1.6 }}
                      dangerouslySetInnerHTML={{
                        __html: renderMarkdown(previewContent)
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 오른쪽 정보 패널 */}
          {showRightPanel && (
            <ErrorBoundary label="RightPanel">
              <RightPanel
                agents={agents}
                agentLogs={agentLogs}
                changedFiles={changedFiles}
                width={rightPanelWidth}
                sessionStats={sessionStats}
                selectedAgent={selectedAgentId ? agents.find((a) => a.id === selectedAgentId) ?? null : null}
                previewContent={previewContent}
                showPreviewTab={!isUltraWide}
                routingLog={routingLog}
              />
            </ErrorBoundary>
          )}
        </div>
      </div>
    </div>
  );
}
