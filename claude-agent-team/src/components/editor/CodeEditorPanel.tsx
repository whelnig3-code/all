"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";

const CodeMirrorEditor = dynamic(() => import("./CodeMirrorEditor"), { ssr: false });

interface FileChangedEvent {
  path: string;
  action: "create" | "modify" | "delete";
  agentId: string;
  timestamp: number;
}

interface CodeEditorPanelProps {
  initialFilePath: string | null;
  onFilePathChange: (path: string | null) => void;
  changedFiles: FileChangedEvent[];
}

// 확장자별 언어 레이블
function getLang(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "TypeScript", tsx: "TSX", js: "JavaScript", jsx: "JSX",
    json: "JSON", md: "Markdown", css: "CSS", html: "HTML",
    py: "Python", sh: "Shell", yml: "YAML", yaml: "YAML",
    txt: "Text",
  };
  return map[ext] ?? ext.toUpperCase();
}

export default function CodeEditorPanel({ initialFilePath, onFilePathChange, changedFiles }: CodeEditorPanelProps) {
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");  // 저장된 원본 (변경 감지용)
  const [filePath, setFilePath] = useState(initialFilePath || "");
  const [pathInput, setPathInput] = useState(initialFilePath || "");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const isDirty = content !== original;

  // ── 파일 열기 ────────────────────────────────────────────────────────────
  const openFile = useCallback(async (path: string) => {
    if (!path.trim()) return;
    setLoading(true);
    try {
      const data = await fetch(`/api/files?path=${encodeURIComponent(path)}`).then((r) => r.json());
      const c = data.content ?? "";
      setContent(c);
      setOriginal(c);
      setFilePath(path);
      setPathInput(path);
    } catch {
      setContent("// 파일을 불러올 수 없습니다");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialFilePath) openFile(initialFilePath);
  }, [initialFilePath, openFile]);

  // ── 저장 (Ctrl+S) ─────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (!filePath || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/files", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: filePath, content }),
      }).then((r) => r.json());
      if (res.ok) {
        setOriginal(content);
        setSaveMsg("저장됨");
        setTimeout(() => setSaveMsg(null), 2000);
      } else {
        setSaveMsg(`오류: ${res.error}`);
        setTimeout(() => setSaveMsg(null), 3000);
      }
    } catch {
      setSaveMsg("저장 실패");
      setTimeout(() => setSaveMsg(null), 3000);
    } finally {
      setSaving(false);
    }
  }, [filePath, content, saving]);

  // ── Ctrl+S 단축키 ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [save]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* 툴바 */}
      <div style={{
        padding: "6px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
        background: "rgba(255,255,255,0.02)",
      }}>
        {/* 경로 입력 */}
        <input
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && openFile(pathInput)}
          placeholder="파일 경로 입력 후 Enter..."
          style={{
            flex: 1, padding: "4px 8px", background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6,
            color: "#9CA3AF", fontSize: 12, outline: "none", fontFamily: "monospace",
          }}
        />
        {/* 언어 레이블 */}
        {filePath && (
          <span style={{ fontSize: 10, color: "#6B7280", flexShrink: 0 }}>
            {getLang(filePath)}
          </span>
        )}
        {/* 변경 표시 */}
        {isDirty && (
          <span style={{ fontSize: 10, color: "#F59E0B", flexShrink: 0 }}>● 미저장</span>
        )}
        {/* 저장 상태 메시지 */}
        {saveMsg && (
          <span style={{
            fontSize: 11, flexShrink: 0,
            color: saveMsg.startsWith("오류") || saveMsg === "저장 실패" ? "#EF4444" : "#22C55E",
          }}>
            {saveMsg}
          </span>
        )}
        {/* 저장 버튼 */}
        <button
          onClick={save}
          disabled={!filePath || !isDirty || saving}
          title="저장 (Ctrl+S)"
          style={{
            padding: "4px 12px", borderRadius: 6, border: "none",
            background: isDirty && filePath ? "#8B5CF6" : "rgba(255,255,255,0.05)",
            color: isDirty && filePath ? "#fff" : "#4B5563",
            cursor: isDirty && filePath ? "pointer" : "not-allowed",
            fontSize: 12, fontWeight: 600, flexShrink: 0,
          }}
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>

      {/* 최근 변경 파일 목록 (에이전트 변경) */}
      {changedFiles.length > 0 && !filePath && (
        <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>최근 변경된 파일</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {changedFiles.slice(0, 5).map((f, i) => (
              <button
                key={i}
                onClick={() => openFile(f.path)}
                style={{
                  fontSize: 11, padding: "2px 8px", borderRadius: 4,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.03)", color: "#9CA3AF",
                  cursor: "pointer",
                }}
              >
                {f.path.split("/").pop() || f.path}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 에디터 본문 */}
      {loading ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#4B5563", fontSize: 13 }}>
          불러오는 중...
        </div>
      ) : filePath ? (
        <CodeMirrorEditor
          value={content}
          filePath={filePath}
          onChange={setContent}
        />
      ) : (
        <div style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          color: "#4B5563", fontSize: 13,
        }}>
          파일 경로를 입력하거나 파일 탐색기에서 파일을 클릭하세요...
        </div>
      )}
    </div>
  );
}
