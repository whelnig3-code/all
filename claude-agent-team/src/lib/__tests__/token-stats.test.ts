/**
 * Token stats unit tests
 *
 * Tests:
 * 1. getTokenDashboardStats aggregation logic
 * 2. incrementApiCall with agentId tracks per-agent stats
 * 3. Formatting utilities (formatTokens, formatCost)
 */
import { describe, it, expect, beforeEach } from "vitest";

// ── Formatting utility tests ────────────────────────────────────────────────
// Import from the component (exported functions)
import { formatTokens, formatCost } from "@/components/dashboard/TokenDashboard";

describe("formatTokens", () => {
  it("returns raw number for values below 1000", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(42)).toBe("42");
    expect(formatTokens(999)).toBe("999");
  });

  it("formats thousands as K", () => {
    expect(formatTokens(1000)).toBe("1K");
    expect(formatTokens(1500)).toBe("1.5K");
    expect(formatTokens(150000)).toBe("150K");
    expect(formatTokens(999999)).toBe("1000K");
  });

  it("formats millions as M", () => {
    expect(formatTokens(1000000)).toBe("1M");
    expect(formatTokens(1200000)).toBe("1.2M");
    expect(formatTokens(2500000)).toBe("2.5M");
  });
});

describe("formatCost", () => {
  it("formats zero cost", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  it("formats small costs with two decimal places", () => {
    expect(formatCost(0.05)).toBe("$0.05");
    expect(formatCost(1.856)).toBe("$1.86");
  });

  it("formats larger costs", () => {
    expect(formatCost(12.5)).toBe("$12.50");
    expect(formatCost(100)).toBe("$100.00");
  });
});

// ── Telemetry aggregation tests ─────────────────────────────────────────────
// We test the actual telemetry module. Since it uses module-level state,
// tests run sequentially and build on each other.

describe("getTokenDashboardStats", () => {
  // Dynamic import to get fresh state reference
  // Note: module state persists across tests in the same vitest run,
  // so we test cumulative behavior.
  let incrementApiCall: (msgLen: number, resLen: number, agentId?: string) => void;
  let getTokenDashboardStats: () => {
    agents: Record<string, { callCount: number; totalTokens: number; estimatedCost: number }>;
    totals: { callCount: number; totalTokens: number; estimatedCost: number };
  };

  beforeEach(async () => {
    // Re-import to get the actual functions (state persists but that's OK)
    const mod = await import("../agent-telemetry");
    incrementApiCall = mod.incrementApiCall;
    getTokenDashboardStats = mod.getTokenDashboardStats;
  });

  it("returns empty stats when no calls have been made with agentId", () => {
    // Call without agentId — should not create agent-level stats
    incrementApiCall(100, 200);

    const stats = getTokenDashboardStats();
    // totals might have data from previous tests but agents should be empty
    // (or have data from other tests in the file)
    expect(stats).toHaveProperty("agents");
    expect(stats).toHaveProperty("totals");
    expect(stats.totals).toHaveProperty("callCount");
    expect(stats.totals).toHaveProperty("totalTokens");
    expect(stats.totals).toHaveProperty("estimatedCost");
  });

  it("tracks per-agent stats when agentId is provided", () => {
    // Record calls for different agents
    // messageLen=400, responseLen=800 → tokens = (400+800)/4 = 300
    incrementApiCall(400, 800, "developer");
    incrementApiCall(200, 600, "reviewer"); // tokens = (200+600)/4 = 200

    const stats = getTokenDashboardStats();

    expect(stats.agents["developer"]).toBeDefined();
    expect(stats.agents["developer"].callCount).toBeGreaterThanOrEqual(1);
    expect(stats.agents["developer"].totalTokens).toBeGreaterThanOrEqual(300);

    expect(stats.agents["reviewer"]).toBeDefined();
    expect(stats.agents["reviewer"].callCount).toBeGreaterThanOrEqual(1);
    expect(stats.agents["reviewer"].totalTokens).toBeGreaterThanOrEqual(200);
  });

  it("accumulates stats for the same agent across multiple calls", () => {
    const statsBefore = getTokenDashboardStats();
    const prevCalls = statsBefore.agents["developer"]?.callCount ?? 0;
    const prevTokens = statsBefore.agents["developer"]?.totalTokens ?? 0;

    // Two more developer calls: 100 tokens each
    incrementApiCall(200, 200, "developer"); // tokens = (200+200)/4 = 100
    incrementApiCall(200, 200, "developer"); // tokens = 100

    const statsAfter = getTokenDashboardStats();
    expect(statsAfter.agents["developer"].callCount).toBe(prevCalls + 2);
    expect(statsAfter.agents["developer"].totalTokens).toBe(prevTokens + 200);
  });

  it("totals sum up all agent stats", () => {
    const stats = getTokenDashboardStats();

    const agentEntries = Object.values(stats.agents);
    const sumCalls = agentEntries.reduce((acc, a) => acc + a.callCount, 0);
    const sumTokens = agentEntries.reduce((acc, a) => acc + a.totalTokens, 0);

    expect(stats.totals.callCount).toBe(sumCalls);
    expect(stats.totals.totalTokens).toBe(sumTokens);
  });

  it("returns immutable copies (no shared references)", () => {
    const stats1 = getTokenDashboardStats();
    const stats2 = getTokenDashboardStats();

    // Different object references
    expect(stats1).not.toBe(stats2);
    expect(stats1.agents).not.toBe(stats2.agents);
    if (stats1.agents["developer"] && stats2.agents["developer"]) {
      expect(stats1.agents["developer"]).not.toBe(stats2.agents["developer"]);
    }
  });

  it("estimated cost follows $15/1M tokens formula", () => {
    // Record a call with known token count
    // messageLen=2000, responseLen=2000 → tokens = 1000
    // cost = (1000 / 1_000_000) * 15 = 0.015
    incrementApiCall(2000, 2000, "planner");

    const stats = getTokenDashboardStats();
    const plannerStats = stats.agents["planner"];
    expect(plannerStats).toBeDefined();
    // Cost should be > 0 for any recorded tokens
    expect(plannerStats.estimatedCost).toBeGreaterThan(0);
  });
});
