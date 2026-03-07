"use client";

import { useState, useEffect, useCallback } from "react";
import { T } from "@/lib/ui-tokens";

// ── Formatting utilities ────────────────────────────────────────────────────

/** Format token count: 0 -> "0", 999 -> "999", 1500 -> "1.5K", 150000 -> "150K", 1200000 -> "1.2M" */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  if (tokens < 1_000_000) {
    const k = tokens / 1000;
    const rounded = Math.round(k * 10) / 10;
    return rounded % 1 === 0 ? `${rounded}K` : `${rounded.toFixed(1)}K`;
  }
  const m = tokens / 1_000_000;
  const rounded = Math.round(m * 10) / 10;
  return rounded % 1 === 0 ? `${rounded}M` : `${rounded.toFixed(1)}M`;
}

/** Format cost as USD: 0 -> "$0.00", 1.856 -> "$1.86" */
export function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

// ── Types ───────────────────────────────────────────────────────────────────

interface AgentStats {
  readonly callCount: number;
  readonly totalTokens: number;
  readonly estimatedCost: number;
}

interface DashboardData {
  readonly agents: Record<string, AgentStats>;
  readonly totals: {
    readonly callCount: number;
    readonly totalTokens: number;
    readonly estimatedCost: number;
  };
}

// ── Agent display config (color + label) ────────────────────────────────────

const AGENT_COLORS: Record<string, string> = {
  planner: "#8B5CF6",
  developer: "#3B82F6",
  reviewer: "#22C55E",
  writer: "#F59E0B",
  "security-auditor": "#EF4444",
  researcher: "#06B6D4",
  designer: "#EC4899",
};

function getAgentColor(agentId: string): string {
  return AGENT_COLORS[agentId] ?? T.accent;
}

// ── Component ───────────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 30_000;

export default function TokenDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stats");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json: DashboardData = await res.json();
      setData(json);
      setLastUpdated(new Date());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch + auto-refresh every 30s
  useEffect(() => {
    fetchStats();
    const timer = setInterval(fetchStats, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchStats]);

  // Sort agents by call count (descending)
  const sortedAgents: Array<{ id: string; stats: AgentStats }> = data
    ? Object.entries(data.agents)
        .map(([id, stats]) => ({ id, stats }))
        .sort((a, b) => b.stats.callCount - a.stats.callCount)
    : [];

  // Max call count for bar width scaling
  const maxCalls = sortedAgents.length > 0
    ? Math.max(...sortedAgents.map((a) => a.stats.callCount))
    : 1;

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: 20,
        color: T.text1,
      }}
    >
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        {/* ── Header ─────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              Token Usage Dashboard
            </div>
            {lastUpdated && (
              <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
                Last updated: {lastUpdated.toLocaleTimeString()}
              </div>
            )}
          </div>
          <button
            onClick={fetchStats}
            disabled={isLoading}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: `1px solid ${T.border}`,
              background: isLoading ? T.card : "transparent",
              color: isLoading ? T.text3 : T.text2,
              cursor: isLoading ? "not-allowed" : "pointer",
              fontSize: 12,
              fontWeight: 600,
              transition: "all 0.15s",
            }}
          >
            {isLoading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {/* ── Error state ────────────────────────────────────────── */}
        {error && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.1)",
              border: `1px solid ${T.error}`,
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 16,
              fontSize: 13,
              color: T.error,
            }}
          >
            Failed to load stats: {error}
          </div>
        )}

        {/* ── Summary card ───────────────────────────────────────── */}
        <div
          style={{
            background: T.card,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
            display: "flex",
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          <SummaryItem
            label="Total Calls"
            value={String(data?.totals.callCount ?? 0)}
            accent={T.accent}
          />
          <SummaryItem
            label="Total Tokens"
            value={formatTokens(data?.totals.totalTokens ?? 0)}
            accent={T.active}
          />
          <SummaryItem
            label="Est. Cost"
            value={formatCost(data?.totals.estimatedCost ?? 0)}
            accent={T.pending}
          />
        </div>

        {/* ── Call distribution bar chart ─────────────────────────── */}
        <div
          style={{
            background: T.card,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: T.text3,
              fontWeight: 700,
              textTransform: "uppercase" as const,
              letterSpacing: "0.07em",
              marginBottom: 12,
            }}
          >
            Call Distribution
          </div>

          {sortedAgents.length === 0 ? (
            <div style={{ color: T.text3, fontSize: 13, padding: "12px 0" }}>
              No agent calls recorded yet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sortedAgents.map(({ id, stats }) => (
                <BarRow
                  key={id}
                  agentId={id}
                  callCount={stats.callCount}
                  maxCalls={maxCalls}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Per-agent cost breakdown ────────────────────────────── */}
        <div
          style={{
            background: T.card,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            padding: 16,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: T.text3,
              fontWeight: 700,
              textTransform: "uppercase" as const,
              letterSpacing: "0.07em",
              marginBottom: 12,
            }}
          >
            Per Agent Cost Breakdown
          </div>

          {sortedAgents.length === 0 ? (
            <div style={{ color: T.text3, fontSize: 13, padding: "12px 0" }}>
              No cost data available yet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {sortedAgents.map(({ id, stats }) => (
                <div
                  key={id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 8px",
                    borderRadius: 6,
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: getAgentColor(id),
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 13, color: T.text1, fontWeight: 500 }}>
                      {id}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: T.text2 }}>
                      {formatTokens(stats.totalTokens)} tokens
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: T.pending,
                        fontWeight: 600,
                        minWidth: 50,
                        textAlign: "right",
                      }}
                    >
                      {formatCost(stats.estimatedCost)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SummaryItem({
  label,
  value,
  accent,
}: {
  readonly label: string;
  readonly value: string;
  readonly accent: string;
}) {
  return (
    <div style={{ flex: 1, minWidth: 100 }}>
      <div
        style={{
          fontSize: 10,
          color: T.text3,
          fontWeight: 700,
          textTransform: "uppercase" as const,
          letterSpacing: "0.07em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent, lineHeight: 1.1 }}>
        {value}
      </div>
    </div>
  );
}

function BarRow({
  agentId,
  callCount,
  maxCalls,
}: {
  readonly agentId: string;
  readonly callCount: number;
  readonly maxCalls: number;
}) {
  const pct = maxCalls > 0 ? (callCount / maxCalls) * 100 : 0;
  const color = getAgentColor(agentId);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {/* Agent name */}
      <div
        style={{
          width: 120,
          fontSize: 12,
          color: T.text2,
          fontWeight: 500,
          flexShrink: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {agentId}
      </div>
      {/* Bar */}
      <div
        style={{
          flex: 1,
          height: 18,
          background: "rgba(255,255,255,0.04)",
          borderRadius: 4,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            width: `${Math.max(pct, 2)}%`,
            height: "100%",
            background: color,
            borderRadius: 4,
            opacity: 0.8,
            transition: "width 0.3s ease",
          }}
        />
      </div>
      {/* Call count */}
      <div
        style={{
          width: 65,
          fontSize: 12,
          color: T.text2,
          textAlign: "right",
          flexShrink: 0,
        }}
      >
        {callCount} calls
      </div>
    </div>
  );
}
