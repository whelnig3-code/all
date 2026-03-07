"use client";

import { useState, useRef } from "react";
import { Project, Agent, ConnectionStatus } from "@/types";
import { T } from "@/lib/ui-tokens";
import { SkeletonListItem } from "@/components/ui/Skeleton";

interface Conversation {
  id: string;
  projectId: string | null;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  collapsed: boolean;
  setCollapsed: (c: boolean) => void;
  projects: Project[];
  activeProjectId: string | null;
  setActiveProjectId: (id: string) => void;
  conversations: Conversation[];
  activeConversationId: string | null;
  setActiveConversationId: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation?: (id: string, title: string) => void;
  onCreateProject: () => void;
  onDeleteProject: (id: string) => void;
  onRenameProject?: (id: string, name: string) => void;
  isConversationsLoading?: boolean;
}

const TABS = [
  { id: "chat",     icon: "💬", label: "채팅" },
  { id: "agents",   icon: "🤖", label: "에이전트" },
  { id: "workflow", icon: "🔄", label: "워크플로우" },
  { id: "files",    icon: "📁", label: "파일" },
  { id: "editor",   icon: "✏️", label: "에디터" },
  { id: "todo",     icon: "✅", label: "TODO" },
  { id: "terminal", icon: "⌨️", label: "터미널" },
  { id: "settings", icon: "⚙️", label: "설정" },
];

export default function Sidebar({
  activeTab, setActiveTab,
  collapsed, setCollapsed,
  projects, activeProjectId, setActiveProjectId,
  conversations, activeConversationId, setActiveConversationId,
  onNewConversation, onDeleteConversation, onRenameConversation,
  onCreateProject, onDeleteProject, onRenameProject,
  isConversationsLoading,
}: SidebarProps) {
  const width = collapsed ? 52 : 220;

  // 인라인 편집 상태
  const [editingConvId, setEditingConvId]     = useState<string | null>(null);
  const [editingConvTitle, setEditingConvTitle] = useState("");
  const [editingProjId, setEditingProjId]     = useState<string | null>(null);
  const [editingProjName, setEditingProjName] = useState("");
  const convInputRef = useRef<HTMLInputElement>(null);
  const projInputRef = useRef<HTMLInputElement>(null);

  const startEditConv = (conv: Conversation) => {
    setEditingConvId(conv.id);
    setEditingConvTitle(conv.title || "새 대화");
    setTimeout(() => convInputRef.current?.select(), 50);
  };

  const commitConvRename = () => {
    if (editingConvId && editingConvTitle.trim()) {
      onRenameConversation?.(editingConvId, editingConvTitle.trim());
    }
    setEditingConvId(null);
  };

  const startEditProj = (proj: Project) => {
    setEditingProjId(proj.id);
    setEditingProjName(proj.name);
    setTimeout(() => projInputRef.current?.select(), 50);
  };

  const commitProjRename = () => {
    if (editingProjId && editingProjName.trim()) {
      onRenameProject?.(editingProjId, editingProjName.trim());
    }
    setEditingProjId(null);
  };

  return (
    <div style={{
      width, minWidth: width,
      height: "100vh",
      background: T.card,
      borderRight: `1px solid ${T.border}`,
      display: "flex", flexDirection: "column",
      transition: "width 0.2s ease",
      overflow: "hidden", flexShrink: 0,
    }}>
      {/* 헤더 */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: collapsed ? "center" : "space-between",
        padding: "14px 12px",
        borderBottom: `1px solid ${T.border}`,
        flexShrink: 0,
      }}>
        {!collapsed && (
          <span style={{ fontSize: 13, fontWeight: 700, color: "#8B5CF6", letterSpacing: "0.05em" }}>
            JM AGENTS
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{
            background: "none", border: "none",
            color: T.text3, cursor: "pointer",
            fontSize: 16, padding: 4, borderRadius: 4,
          }}
        >
          {collapsed ? "→" : "←"}
        </button>
      </div>

      {/* 탭 네비게이션 */}
      <nav style={{ padding: "8px 6px", flexShrink: 0 }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            title={tab.label}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              width: "100%", padding: "7px 8px", marginBottom: 2,
              borderRadius: 6,
              // 좌측 3px accent 바 — active 시 강조
              border: "none",
              borderLeft: activeTab === tab.id ? `3px solid ${T.accent}` : "3px solid transparent",
              background: activeTab === tab.id ? T.cardHover : "transparent",
              color: activeTab === tab.id ? T.text1 : T.text3,
              cursor: "pointer", fontSize: 12,
              fontWeight: activeTab === tab.id ? 600 : 400,
              textAlign: "left", transition: "background 0.15s, border-left-color 0.15s",
            }}
          >
            <span style={{ fontSize: 14, flexShrink: 0 }}>{tab.icon}</span>
            {!collapsed && <span>{tab.label}</span>}
          </button>
        ))}
      </nav>

      {/* 대화 목록 (채팅 탭일 때) */}
      {!collapsed && activeTab === "chat" && (
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{
            display: "flex", alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 12px 4px", flexShrink: 0,
          }}>
            <span style={{ fontSize: 10, color: T.text3, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              대화
            </span>
            <button
              onClick={onNewConversation}
              title="새 대화"
              style={{
                background: "none", border: "none",
                color: T.text3, cursor: "pointer",
                fontSize: 16, padding: "2px 4px", borderRadius: 4,
              }}
            >
              +
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "0 6px" }}>
            {isConversationsLoading ? (
              <div style={{ padding: "4px 0" }}>
                {Array.from({ length: 5 }, (_, i) => (
                  <SkeletonListItem key={i} />
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <div style={{ padding: "12px 8px", color: T.text3, fontSize: 11 }}>
                대화가 없습니다
              </div>
            ) : (
              conversations.map((conv) => {
                const isActive  = activeConversationId === conv.id;
                const isEditing = editingConvId === conv.id;
                return (
                  <div
                    key={conv.id}
                    onClick={() => !isEditing && setActiveConversationId(conv.id)}
                    onDoubleClick={() => startEditConv(conv)}
                    title="더블클릭으로 이름 변경"
                    style={{
                      padding: "6px 8px",
                      borderRadius: 6, marginBottom: 2,
                      cursor: "pointer",
                      background: isActive ? "rgba(139,92,246,0.12)" : "transparent",
                      color: isActive ? "#C4B5FD" : T.text2,
                      fontSize: 12,
                      display: "flex", alignItems: "center",
                      justifyContent: "space-between", gap: 4,
                      border: isActive ? `1px solid rgba(139,92,246,0.2)` : "1px solid transparent",
                    }}
                  >
                    {isEditing ? (
                      // 인라인 이름 편집 입력창
                      <input
                        ref={convInputRef}
                        value={editingConvTitle}
                        onChange={(e) => setEditingConvTitle(e.target.value)}
                        onBlur={commitConvRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter")  commitConvRename();
                          if (e.key === "Escape") setEditingConvId(null);
                          e.stopPropagation();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          flex: 1,
                          background: "rgba(139,92,246,0.15)",
                          border: "1px solid rgba(139,92,246,0.5)",
                          borderRadius: 4, padding: "2px 6px",
                          color: "#C4B5FD", fontSize: 12, outline: "none",
                        }}
                      />
                    ) : (
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                        {conv.title || "새 대화"}
                      </span>
                    )}

                    {/* hover 시 표시되는 액션 버튼들 */}
                    {!isEditing && (
                      <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
                        {/* 이름 변경 버튼 */}
                        <button
                          onClick={(e) => { e.stopPropagation(); startEditConv(conv); }}
                          title="이름 변경"
                          className="delete-btn"
                          style={{
                            background: "none", border: "none",
                            color: T.text3, cursor: "pointer",
                            fontSize: 10, padding: "2px 3px",
                            flexShrink: 0, borderRadius: 3,
                            lineHeight: 1,
                          }}
                        >
                          ✎
                        </button>
                        {/* 삭제 버튼 */}
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeleteConversation(conv.id); }}
                          title="삭제"
                          className="delete-btn"
                          style={{
                            background: "none", border: "none",
                            color: T.text3, cursor: "pointer",
                            fontSize: 11, padding: "2px 3px",
                            flexShrink: 0, borderRadius: 3,
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 프로젝트 목록 */}
      {!collapsed && (
        <div style={{ borderTop: `1px solid ${T.border}`, padding: "8px 6px", flexShrink: 0 }}>
          <div style={{
            display: "flex", alignItems: "center",
            justifyContent: "space-between",
            padding: "4px 8px 4px",
          }}>
            <span style={{ fontSize: 10, color: T.text3, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              프로젝트
            </span>
            <button
              onClick={onCreateProject}
              title="새 프로젝트"
              style={{
                background: "none", border: "none",
                color: T.text3, cursor: "pointer",
                fontSize: 16, padding: "2px 4px",
              }}
            >
              +
            </button>
          </div>

          {projects.slice(0, 5).map((p) => (
            <div
              key={p.id}
              onDoubleClick={() => startEditProj(p)}
              onClick={() => editingProjId !== p.id && setActiveProjectId(p.id)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                width: "100%", padding: "5px 8px",
                borderRadius: 6, marginBottom: 1,
                background: activeProjectId === p.id ? "rgba(139,92,246,0.12)" : "transparent",
                color: activeProjectId === p.id ? "#C4B5FD" : T.text2,
                cursor: "pointer", fontSize: 12,
              }}
            >
              <span style={{ flexShrink: 0 }}>{p.icon}</span>
              {editingProjId === p.id ? (
                <input
                  ref={projInputRef}
                  value={editingProjName}
                  onChange={(e) => setEditingProjName(e.target.value)}
                  onBlur={commitProjRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter")  commitProjRename();
                    if (e.key === "Escape") setEditingProjId(null);
                    e.stopPropagation();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    flex: 1,
                    background: "rgba(139,92,246,0.15)",
                    border: "1px solid rgba(139,92,246,0.5)",
                    borderRadius: 4, padding: "2px 6px",
                    color: "#C4B5FD", fontSize: 12, outline: "none",
                  }}
                />
              ) : (
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
