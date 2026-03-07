"use client";

import { useState } from "react";
import { Agent } from "@/types";

interface CommandPaletteProps {
  agents: Agent[];
  onSelectAgent: (agentId: string) => void;
  onClose: () => void;
}

export default function CommandPalette({ agents, onSelectAgent, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");

  const filtered = agents.filter(
    (a) =>
      a.name.toLowerCase().includes(query.toLowerCase()) ||
      a.id.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "15vh",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#1A1A1F",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          width: 440,
          maxWidth: "90vw",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="에이전트 선택... (Ctrl+K)"
          style={{
            width: "100%",
            padding: "14px 16px",
            background: "transparent",
            border: "none",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            color: "#F9FAFB",
            fontSize: 14,
            outline: "none",
          }}
          onKeyDown={(e) => e.key === "Escape" && onClose()}
        />
        <div style={{ maxHeight: 300, overflowY: "auto" }}>
          {filtered.map((agent) => (
            <button
              key={agent.id}
              onClick={() => onSelectAgent(agent.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "10px 16px",
                border: "none",
                background: "transparent",
                color: "#E5E7EB",
                cursor: "pointer",
                fontSize: 13,
                textAlign: "left",
              }}
            >
              <span style={{ fontSize: 18 }}>{agent.icon}</span>
              <div>
                <div style={{ fontWeight: 500 }}>{agent.name}</div>
                <div style={{ fontSize: 11, color: "#6B7280" }}>{agent.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
