"use client";

import { T } from "@/lib/ui-tokens";
import type { ConnectionStatus } from "@/types";

interface MobileHeaderProps {
  readonly onMenuToggle: () => void;
  readonly connectionStatus?: ConnectionStatus;
}

/** 모바일 상단 헤더 — 햄버거 메뉴 + 타이틀 + 연결 상태 */
export default function MobileHeader({ onMenuToggle, connectionStatus = "connected" }: MobileHeaderProps) {
  const statusColor =
    connectionStatus === "connected"   ? "#22C55E" :
    connectionStatus === "connecting"  ? "#F59E0B" :
    connectionStatus === "error"       ? "#EF4444" :
    "#6B7280";

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      height: 48,
      padding: "0 12px",
      background: T.card,
      borderBottom: `1px solid ${T.border}`,
      flexShrink: 0,
    }}>
      {/* 햄버거 메뉴 버튼 */}
      <button
        onClick={onMenuToggle}
        aria-label="메뉴 열기"
        style={{
          width: 44,
          height: 44,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          border: "none",
          background: "none",
          cursor: "pointer",
          padding: 0,
        }}
      >
        <span style={{ width: 18, height: 2, background: T.text2, borderRadius: 1 }} />
        <span style={{ width: 18, height: 2, background: T.text2, borderRadius: 1 }} />
        <span style={{ width: 18, height: 2, background: T.text2, borderRadius: 1 }} />
      </button>

      {/* 타이틀 */}
      <div style={{ flex: 1, textAlign: "center" }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: T.text1, letterSpacing: "0.05em" }}>
          JM AGENTS
        </span>
      </div>

      {/* 연결 상태 */}
      <div style={{
        width: 44,
        height: 44,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <div style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: statusColor,
        }} />
      </div>
    </div>
  );
}
