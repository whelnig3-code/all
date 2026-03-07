"use client";

import { useState } from "react";

interface ProjectSetupPanelProps {
  onClose?: () => void;
  onCreate?: (data: { name: string; icon: string; description: string; path: string }) => void;
}

export default function ProjectSetupPanel({ onClose, onCreate }: ProjectSetupPanelProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📁");
  const [description, setDescription] = useState("");
  const [path, setPath] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate?.({ name, icon, description, path });
  };

  const modal = (
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
          background: "#1A1A1F",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 12,
          padding: 24,
          width: 400,
          maxWidth: "90vw",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>새 프로젝트</div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: "#9CA3AF", display: "block", marginBottom: 4 }}>아이콘</label>
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              style={{ width: "100%", padding: "6px 10px", background: "#0A0A0B", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#F9FAFB", fontSize: 18 }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: "#9CA3AF", display: "block", marginBottom: 4 }}>이름 *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{ width: "100%", padding: "6px 10px", background: "#0A0A0B", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#F9FAFB", fontSize: 13, outline: "none" }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: "#9CA3AF", display: "block", marginBottom: 4 }}>설명</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ width: "100%", padding: "6px 10px", background: "#0A0A0B", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#F9FAFB", fontSize: 13, outline: "none" }}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, color: "#9CA3AF", display: "block", marginBottom: 4 }}>경로</label>
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              style={{ width: "100%", padding: "6px 10px", background: "#0A0A0B", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#F9FAFB", fontSize: 13, outline: "none", fontFamily: "monospace" }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            {onClose && (
              <button type="button" onClick={onClose} style={{ padding: "6px 16px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#9CA3AF", cursor: "pointer", fontSize: 13 }}>
                취소
              </button>
            )}
            <button type="submit" style={{ padding: "6px 16px", borderRadius: 6, border: "none", background: "#8B5CF6", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              생성
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  if (onClose) return modal;

  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {modal}
    </div>
  );
}
