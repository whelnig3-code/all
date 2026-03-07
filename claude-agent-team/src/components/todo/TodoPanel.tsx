"use client";

import { useState, useEffect, useCallback } from "react";

interface Todo {
  id: string;
  text: string;
  done: boolean;
  priority: "low" | "medium" | "high";
  createdAt: number;
}

// 우선순위별 색상
const PRIORITY_COLOR: Record<string, string> = {
  high: "#EF4444",
  medium: "#F59E0B",
  low: "#6B7280",
};

export default function TodoPanel() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [input, setInput] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "done">("all");

  // ── API 로드 ──────────────────────────────────────────────────────────────
  const loadTodos = useCallback(async () => {
    try {
      const data = await fetch("/api/todos").then((r) => r.json());
      setTodos(data.todos ?? []);
    } catch {
      // API 실패 시 localStorage 폴백
      try {
        const saved = localStorage.getItem("jm-todos");
        if (saved) setTodos(JSON.parse(saved));
      } catch { /* ignore */ }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTodos(); }, [loadTodos]);

  // ── 추가 ──────────────────────────────────────────────────────────────────
  const addTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    try {
      const data = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input.trim(), priority }),
      }).then((r) => r.json());
      setTodos((prev) => [data.todo, ...prev]);
    } catch {
      // 폴백: 로컬 상태만 업데이트
      const todo: Todo = { id: Date.now().toString(), text: input.trim(), done: false, priority, createdAt: Date.now() };
      setTodos((prev) => {
        const next = [todo, ...prev];
        localStorage.setItem("jm-todos", JSON.stringify(next));
        return next;
      });
    }
    setInput("");
  };

  // ── 토글 ──────────────────────────────────────────────────────────────────
  const toggle = async (id: string) => {
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
    try {
      await fetch("/api/todos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, done: !todo.done }),
      });
    } catch { /* 로컬 상태는 이미 업데이트됨 */ }
  };

  // ── 삭제 ──────────────────────────────────────────────────────────────────
  const remove = async (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    try {
      await fetch(`/api/todos?id=${id}`, { method: "DELETE" });
    } catch { /* ignore */ }
  };

  // ── 완료 항목 일괄 삭제 ──────────────────────────────────────────────────
  const clearDone = async () => {
    const doneIds = todos.filter((t) => t.done).map((t) => t.id);
    setTodos((prev) => prev.filter((t) => !t.done));
    await Promise.all(doneIds.map((id) =>
      fetch(`/api/todos?id=${id}`, { method: "DELETE" }).catch(() => {})
    ));
  };

  const filtered = todos.filter((t) =>
    filter === "all" ? true : filter === "done" ? t.done : !t.done
  );
  const doneCount = todos.filter((t) => t.done).length;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 20, overflow: "hidden" }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#F9FAFB" }}>
          ✅ TODO
          <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 400, marginLeft: 8 }}>
            {todos.length - doneCount}개 남음 / 전체 {todos.length}개
          </span>
        </div>
        {doneCount > 0 && (
          <button
            onClick={clearDone}
            style={{ fontSize: 11, color: "#6B7280", background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}
          >
            완료 삭제
          </button>
        )}
      </div>

      {/* 입력 폼 */}
      <form onSubmit={addTodo} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="새 할 일 추가..."
          style={{
            flex: 1, padding: "8px 12px",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8, color: "#F9FAFB", fontSize: 13, outline: "none",
          }}
        />
        {/* 우선순위 선택 */}
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as "low" | "medium" | "high")}
          style={{
            padding: "8px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.05)", color: PRIORITY_COLOR[priority],
            fontSize: 12, cursor: "pointer", outline: "none",
          }}
        >
          <option value="high" style={{ color: "#EF4444" }}>🔴 높음</option>
          <option value="medium" style={{ color: "#F59E0B" }}>🟡 보통</option>
          <option value="low" style={{ color: "#6B7280" }}>⚪ 낮음</option>
        </select>
        <button
          type="submit"
          style={{
            padding: "8px 16px", borderRadius: 8, border: "none",
            background: "#8B5CF6", color: "#fff", cursor: "pointer",
            fontSize: 13, fontWeight: 600,
          }}
        >
          추가
        </button>
      </form>

      {/* 필터 탭 */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {(["all", "active", "done"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              fontSize: 11, padding: "3px 10px", borderRadius: 6, border: "none",
              background: filter === f ? "rgba(139,92,246,0.2)" : "transparent",
              color: filter === f ? "#A78BFA" : "#6B7280", cursor: "pointer",
            }}
          >
            {f === "all" ? "전체" : f === "active" ? "진행 중" : "완료"}
          </button>
        ))}
      </div>

      {/* 목록 */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading ? (
          <div style={{ color: "#4B5563", fontSize: 13, textAlign: "center", marginTop: 40 }}>불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: "#4B5563", fontSize: 13, textAlign: "center", marginTop: 40 }}>
            {filter === "done" ? "완료된 항목이 없습니다" : filter === "active" ? "진행 중인 할 일이 없습니다" : "할 일이 없습니다"}
          </div>
        ) : (
          filtered.map((todo) => (
            <div
              key={todo.id}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 12px", borderRadius: 8, marginBottom: 4,
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${todo.done ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.06)"}`,
                opacity: todo.done ? 0.7 : 1,
              }}
            >
              {/* 우선순위 인디케이터 */}
              <div style={{
                width: 3, height: 16, borderRadius: 2,
                background: todo.done ? "#374151" : PRIORITY_COLOR[todo.priority],
                flexShrink: 0,
              }} />
              <input
                type="checkbox"
                checked={todo.done}
                onChange={() => toggle(todo.id)}
                style={{ width: 14, height: 14, cursor: "pointer", flexShrink: 0 }}
              />
              <span style={{
                flex: 1, fontSize: 13,
                color: todo.done ? "#4B5563" : "#E5E7EB",
                textDecoration: todo.done ? "line-through" : "none",
              }}>
                {todo.text}
              </span>
              <button
                onClick={() => remove(todo.id)}
                style={{
                  background: "none", border: "none", color: "#4B5563",
                  cursor: "pointer", fontSize: 14, padding: 2, flexShrink: 0,
                }}
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
