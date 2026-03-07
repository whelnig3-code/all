"use client";

import { useState, useEffect, useCallback, useRef, memo } from "react";
import { subscribeToast } from "@/lib/toast-events";

interface ToastItem {
  id: string;
  msg: string;
  count: number;
}

const MAX_TOASTS = 3;
const DURATION   = 3000;

/**
 * 전역 에러 토스트 렌더러
 * layout.tsx의 <body> 안에 마운트 — 앱 전역에서 showErrorToast() 호출 시 표시됨
 */
export const ToastProvider = memo(function ToastProvider() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // 개별 toast dismiss
  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // toast 추가 (dedup + 최대 3개 유지)
  const add = useCallback((msg: string) => {
    setToasts((prev) => {
      // 동일 메시지 → count 증가 + timer 리셋
      const existing = prev.find((t) => t.msg === msg);
      if (existing) {
        const oldTimer = timersRef.current.get(existing.id);
        if (oldTimer) clearTimeout(oldTimer);
        const newTimer = setTimeout(() => dismiss(existing.id), DURATION);
        timersRef.current.set(existing.id, newTimer);
        return prev.map((t) => t.id === existing.id ? { ...t, count: t.count + 1 } : t);
      }

      // 최대 3개 초과 → 가장 오래된 것 제거
      let next = prev;
      if (prev.length >= MAX_TOASTS) {
        const oldest = prev[0];
        const oldTimer = timersRef.current.get(oldest.id);
        if (oldTimer) clearTimeout(oldTimer);
        timersRef.current.delete(oldest.id);
        next = prev.slice(1);
      }

      const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const timer = setTimeout(() => dismiss(id), DURATION);
      timersRef.current.set(id, timer);
      return [...next, { id, msg, count: 1 }];
    });
  }, [dismiss]);

  // 이벤트 버스 구독
  useEffect(() => subscribeToast(add), [add]);

  // 언마운트 시 타이머 전체 정리
  useEffect(() => {
    return () => { timersRef.current.forEach((t) => clearTimeout(t)); };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="toast-enter"
          style={{
            minWidth: 320,
            maxWidth: 420,
            background: "#181C23",
            border: "1px solid #EF4444",
            borderLeft: "3px solid #EF4444",
            borderRadius: 12,
            padding: "12px 14px",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            pointerEvents: "all",
            boxShadow: "0 4px 20px rgba(0,0,0,0.45), 0 0 0 1px rgba(239,68,68,0.08)",
          }}
        >
          {/* [ERROR] 뱃지 */}
          <span style={{
            fontSize: 9, fontWeight: 700,
            color: "#EF4444",
            background: "rgba(239,68,68,0.15)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 4,
            padding: "2px 6px", lineHeight: 1.6,
            flexShrink: 0, marginTop: 1,
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
          }}>
            ERROR
          </span>

          {/* 메시지 */}
          <span style={{
            flex: 1,
            fontSize: 12, lineHeight: 1.5,
            color: "#E6EDF3",
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            wordBreak: "break-word",
          }}>
            {toast.msg}
          </span>

          {/* 반복 횟수 뱃지 */}
          {toast.count > 1 && (
            <span style={{
              fontSize: 10, fontWeight: 700,
              color: "#EF4444",
              background: "rgba(239,68,68,0.2)",
              borderRadius: 999,
              padding: "1px 7px",
              flexShrink: 0, marginTop: 1,
            }}>
              ×{toast.count}
            </span>
          )}

          {/* 닫기 버튼 */}
          <button
            onClick={() => dismiss(toast.id)}
            style={{
              background: "none", border: "none",
              color: "#6B7280", cursor: "pointer",
              fontSize: 13, lineHeight: 1,
              padding: 0, flexShrink: 0, marginTop: 1,
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
});
