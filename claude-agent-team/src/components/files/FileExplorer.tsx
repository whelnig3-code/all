"use client";

import { useState, useEffect, useCallback } from "react";

interface FileChangedEvent {
  path: string;
  action: "create" | "modify" | "delete";
  agentId: string;
  timestamp: number;
}

interface FileNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: FileNode[];
}

interface FileExplorerProps {
  changedFiles: FileChangedEvent[];
  onOpenInEditor: (filePath: string) => void;
}

// 확장자별 아이콘
function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const icons: Record<string, string> = {
    ts: "📘", tsx: "⚛️", js: "📜", jsx: "⚛️",
    json: "📋", md: "📝", css: "🎨", html: "🌐",
    sh: "⚙️", py: "🐍", yml: "📄", yaml: "📄",
    png: "🖼️", jpg: "🖼️", svg: "🖼️", gif: "🖼️",
    env: "🔑",
  };
  return icons[ext] ?? "📄";
}

function FileTreeNode({ node, depth, onOpen, changedPaths }: {
  node: FileNode;
  depth: number;
  onOpen: (path: string) => void;
  changedPaths: Set<string>;
}) {
  const [open, setOpen] = useState(depth === 0);  // 루트는 기본 열림
  const isChanged = changedPaths.has(node.path);

  if (node.type === "dir") {
    return (
      <div>
        <div
          onClick={() => setOpen((o) => !o)}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "3px 8px", paddingLeft: depth * 12 + 8,
            cursor: "pointer", color: "#9CA3AF", fontSize: 12,
            borderRadius: 4,
          }}
        >
          <span style={{ fontSize: 10, color: "#4B5563", flexShrink: 0 }}>{open ? "▾" : "▸"}</span>
          <span style={{ fontSize: 13, flexShrink: 0 }}>📁</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {node.name}
          </span>
        </div>
        {open && node.children && (
          <div>
            {node.children.map((child) => (
              <FileTreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                onOpen={onOpen}
                changedPaths={changedPaths}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={() => onOpen(node.path)}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "3px 8px", paddingLeft: depth * 12 + 8,
        cursor: "pointer",
        color: isChanged ? "#F59E0B" : "#9CA3AF",
        fontSize: 12, borderRadius: 4,
      }}
    >
      <span style={{ fontSize: 11, flexShrink: 0 }}>{fileIcon(node.name)}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
        {node.name}
      </span>
      {isChanged && <span style={{ fontSize: 9, color: "#F59E0B", flexShrink: 0 }}>●</span>}
    </div>
  );
}

export default function FileExplorer({ changedFiles, onOpenInEditor }: FileExplorerProps) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"tree" | "changed">("tree");
  const [searchQuery, setSearchQuery] = useState("");

  // 변경된 파일 경로 Set (빠른 조회)
  const changedPaths = new Set(changedFiles.map((f) => f.path));

  const loadTree = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depth: 3 }),
      }).then((r) => r.json());
      setTree(data.tree ?? []);
    } catch {
      setTree([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTree(); }, [loadTree]);

  // 검색 필터 (파일 이름 기준 평탄화)
  function flattenTree(nodes: FileNode[]): FileNode[] {
    return nodes.flatMap((n) =>
      n.type === "file"
        ? [n]
        : flattenTree(n.children ?? [])
    );
  }

  const allFiles = flattenTree(tree);
  const filteredFiles = searchQuery.trim()
    ? allFiles.filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* 헤더 */}
      <div style={{
        padding: "10px 12px 6px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#F9FAFB" }}>파일 탐색기</div>
          <button
            onClick={loadTree}
            title="새로고침"
            style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", fontSize: 13, padding: 2 }}
          >
            ↺
          </button>
        </div>
        {/* 탭 */}
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          {(["tree", "changed"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                fontSize: 11, padding: "2px 8px", borderRadius: 5, border: "none",
                background: tab === t ? "rgba(139,92,246,0.2)" : "transparent",
                color: tab === t ? "#A78BFA" : "#6B7280", cursor: "pointer",
              }}
            >
              {t === "tree" ? "전체 트리" : `변경됨 (${changedFiles.length})`}
            </button>
          ))}
        </div>
        {/* 검색 */}
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="파일 검색..."
          style={{
            width: "100%", padding: "5px 10px", background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6,
            color: "#9CA3AF", fontSize: 12, outline: "none", boxSizing: "border-box",
          }}
        />
      </div>

      {/* 본문 */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {loading ? (
          <div style={{ color: "#4B5563", fontSize: 12, padding: "16px 12px" }}>불러오는 중...</div>
        ) : searchQuery.trim() ? (
          /* 검색 결과 */
          filteredFiles.length === 0 ? (
            <div style={{ color: "#4B5563", fontSize: 12, padding: "16px 12px" }}>검색 결과 없음</div>
          ) : (
            filteredFiles.map((f) => (
              <div
                key={f.path}
                onClick={() => onOpenInEditor(f.path)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "4px 12px", cursor: "pointer",
                  color: changedPaths.has(f.path) ? "#F59E0B" : "#9CA3AF", fontSize: 12,
                }}
              >
                <span>{fileIcon(f.name)}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.path}
                </span>
              </div>
            ))
          )
        ) : tab === "tree" ? (
          /* 파일 트리 */
          tree.length === 0 ? (
            <div style={{ color: "#4B5563", fontSize: 12, padding: "16px 12px" }}>파일 없음</div>
          ) : (
            tree.map((node) => (
              <FileTreeNode
                key={node.path}
                node={node}
                depth={0}
                onOpen={onOpenInEditor}
                changedPaths={changedPaths}
              />
            ))
          )
        ) : (
          /* 변경된 파일 목록 */
          changedFiles.length === 0 ? (
            <div style={{ color: "#4B5563", fontSize: 12, padding: "16px 12px" }}>변경된 파일 없음</div>
          ) : (
            changedFiles.map((f, i) => (
              <div
                key={i}
                onClick={() => onOpenInEditor(f.path)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "5px 12px", cursor: "pointer",
                  color: "#9CA3AF", fontSize: 12, borderRadius: 4,
                }}
              >
                <span style={{
                  color: f.action === "create" ? "#22C55E" : f.action === "delete" ? "#EF4444" : "#F59E0B",
                  fontSize: 11, fontWeight: 700, width: 10, flexShrink: 0,
                }}>
                  {f.action === "create" ? "+" : f.action === "delete" ? "−" : "~"}
                </span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.path}
                </span>
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
}
