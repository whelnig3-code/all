#!/usr/bin/env node
/**
 * 성능 리포트 생성 스크립트
 *
 * 사용법:
 *   npx tsx scripts/performance-report.ts <logfile>
 *   node --experimental-strip-types scripts/performance-report.ts <logfile>
 *
 * 입력: CHAIN_SUMMARY + AGENT_DURATION 로그 라인이 포함된 파일
 *   [METRIC] CHAIN_SUMMARY durationMs=N hopCount=N status=COMPLETED agents=X
 *   [METRIC] AGENT_DURATION taskId agent=X hop=N durationMs=N status=OK|TIMEOUT|ERROR
 *
 * 외부 라이브러리 사용 금지 (fs + 정규식만)
 */

import { readFileSync } from "fs";

// ── 타입 정의 ──────────────────────────────────────────────────────────────

interface ChainRecord {
  durationMs: number;
  hopCount: number;
  status: string;
}

interface AgentDurationRecord {
  taskId: string;
  agent: string;
  hop: number;
  durationMs: number;
  status: "OK" | "TIMEOUT" | "ERROR";
}

// ── 파싱 헬퍼 ──────────────────────────────────────────────────────────────

/** key=N 형식에서 정수 추출 */
function extractInt(line: string, key: string): number | null {
  const m = line.match(new RegExp(`${key}=(\\d+)`));
  return m ? parseInt(m[1], 10) : null;
}

/** key=VALUE 형식에서 문자열 추출 (영문자·숫자·-·_ 허용) */
function extractStr(line: string, key: string): string | null {
  const m = line.match(new RegExp(`${key}=([\\w.-]+)`));
  return m ? m[1] : null;
}

// ── 백분위수 계산 ──────────────────────────────────────────────────────────

/** 오름차순 정렬된 배열에서 P(percentile) 값 반환 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(sorted.length * (p / 100)) - 1;
  return sorted[Math.min(Math.max(idx, 0), sorted.length - 1)];
}

// ── 메인 ───────────────────────────────────────────────────────────────────

function main(): void {
  const logFile = process.argv[2];
  if (!logFile) {
    console.error("Usage: npx tsx scripts/performance-report.ts <logfile>");
    process.exit(1);
  }

  let raw: string;
  try {
    raw = readFileSync(logFile, "utf-8");
  } catch {
    console.error(`[ERROR] 파일을 읽을 수 없습니다: ${logFile}`);
    process.exit(1);
  }

  const lines = raw.split(/\r?\n/);

  // ── 파싱 ────────────────────────────────────────────────────────────────
  const chains: ChainRecord[] = [];
  const agentRecs: AgentDurationRecord[] = [];

  for (const line of lines) {
    // CHAIN_SUMMARY 파싱
    if (line.includes("[METRIC] CHAIN_SUMMARY")) {
      const durationMs = extractInt(line, "durationMs");
      const hopCount   = extractInt(line, "hopCount");
      const status     = extractStr(line, "status");
      if (durationMs !== null && hopCount !== null && status) {
        chains.push({ durationMs, hopCount, status });
      }
      continue;
    }

    // AGENT_DURATION 파싱
    // 형식: [METRIC] AGENT_DURATION <taskId> agent=X hop=N durationMs=N status=S
    if (line.includes("[METRIC] AGENT_DURATION")) {
      const parts      = line.split(/\s+/);
      const taskIdIdx  = parts.findIndex((p) => p === "AGENT_DURATION") + 1;
      const taskId     = parts[taskIdIdx] ?? "";
      const agent      = extractStr(line, "agent");
      const hop        = extractInt(line, "hop");
      const durationMs = extractInt(line, "durationMs");
      const statusRaw  = extractStr(line, "status");

      if (agent && hop !== null && durationMs !== null && statusRaw) {
        const status = (["OK", "TIMEOUT", "ERROR"].includes(statusRaw)
          ? statusRaw
          : "ERROR") as "OK" | "TIMEOUT" | "ERROR";
        agentRecs.push({ taskId, agent, hop, durationMs, status });
      }
    }
  }

  // ── 체인 레벨 통계 ────────────────────────────────────────────────────────
  // CHAIN_SUMMARY가 없는 경우 AGENT_DURATION(hop=0)을 단일 hop 체인으로 간주
  let allChainDurations: number[];
  let allHopCounts: number[];
  let budgetExceededCount: number;

  if (chains.length > 0) {
    allChainDurations   = chains.map((c) => c.durationMs).sort((a, b) => a - b);
    allHopCounts        = chains.map((c) => c.hopCount);
    budgetExceededCount = chains.filter((c) => c.status === "BUDGET_EXCEEDED").length;
  } else {
    // 폴백: AGENT_DURATION(hop=0) → 단일 hop 체인으로 처리
    const firstHops     = agentRecs.filter((r) => r.hop === 0);
    allChainDurations   = firstHops.map((r) => r.durationMs).sort((a, b) => a - b);
    allHopCounts        = firstHops.map(() => 1);
    budgetExceededCount = 0;
  }

  const totalRequests = allChainDurations.length;

  if (totalRequests === 0) {
    console.log("===== PERFORMANCE REPORT =====");
    console.log("No data found. Check log format:");
    console.log("  [METRIC] CHAIN_SUMMARY durationMs=N hopCount=N status=X");
    console.log("  [METRIC] AGENT_DURATION taskId agent=X hop=N durationMs=N status=OK");
    return;
  }

  const avgChainDuration  = Math.round(
    allChainDurations.reduce((a, b) => a + b, 0) / allChainDurations.length
  );
  const p95ChainDuration  = percentile(allChainDurations, 95);
  const avgHopCount       = (
    allHopCounts.reduce((a, b) => a + b, 0) / allHopCounts.length
  ).toFixed(1);
  const hop3Count         = allHopCounts.filter((h) => h >= 3).length;
  const hop3Ratio         = ((hop3Count / totalRequests) * 100).toFixed(1);
  const budgetRatio       = ((budgetExceededCount / totalRequests) * 100).toFixed(1);

  // ── 에이전트 레벨 통계 ────────────────────────────────────────────────────
  const AGENT_IDS = [
    "developer", "reviewer", "security-auditor",
    "planner", "writer", "researcher", "designer",
  ];

  type AgentStat = { durationMs: number; status: string };
  const agentMap: Record<string, AgentStat[]> = {};

  for (const r of agentRecs) {
    if (!agentMap[r.agent]) agentMap[r.agent] = [];
    agentMap[r.agent].push({ durationMs: r.durationMs, status: r.status });
  }

  // 전체 에이전트 평균 (병목 감지 기준)
  const allAgentDurations = agentRecs.map((r) => r.durationMs);
  const overallAgentAvg   =
    allAgentDurations.length > 0
      ? allAgentDurations.reduce((a, b) => a + b, 0) / allAgentDurations.length
      : 0;

  // ── 출력 ────────────────────────────────────────────────────────────────
  console.log("===== PERFORMANCE REPORT =====");
  console.log(`Total Requests: ${totalRequests}`);
  console.log(`Avg Chain Duration: ${avgChainDuration}ms`);
  console.log(`P95 Chain Duration: ${p95ChainDuration}ms`);
  console.log(`Avg Hop Count: ${avgHopCount}`);
  console.log(`Hop ≥3 Ratio: ${hop3Ratio}%`);
  console.log(`Budget Exceeded Ratio: ${budgetRatio}%`);

  console.log("---- Agent Breakdown ----");
  for (const agentId of AGENT_IDS) {
    const recs = agentMap[agentId];
    if (!recs || recs.length === 0) {
      console.log(`${agentId}: no data`);
      continue;
    }
    const avg        = Math.round(recs.reduce((a, r) => a + r.durationMs, 0) / recs.length);
    const timeouts   = recs.filter((r) => r.status === "TIMEOUT").length;
    const timeoutPct = ((timeouts / recs.length) * 100).toFixed(1);
    console.log(`${agentId}: avg=${avg}ms, timeout=${timeoutPct}%`);
  }

  console.log("---- Bottleneck Detection ----");
  // 병목 기준: 평균 > 전체 평균 × 1.3  OR  timeout 비율 > 10%
  const bottlenecks: string[] = [];
  for (const agentId of AGENT_IDS) {
    const recs = agentMap[agentId];
    if (!recs || recs.length === 0) continue;

    const avg        = Math.round(recs.reduce((a, r) => a + r.durationMs, 0) / recs.length);
    const timeouts   = recs.filter((r) => r.status === "TIMEOUT").length;
    const timeoutPct = parseFloat(((timeouts / recs.length) * 100).toFixed(1));

    const isSlowAvg      = overallAgentAvg > 0 && avg > overallAgentAvg * 1.3;
    const isHighTimeout  = timeoutPct > 10;

    if (isSlowAvg || isHighTimeout) {
      const warn = `[WARN] BOTTLENECK_AGENT ${agentId} avg=${avg}ms timeout=${timeoutPct}%`;
      console.log(warn);
      bottlenecks.push(warn);
    }
  }
  if (bottlenecks.length === 0) {
    console.log("No bottlenecks detected.");
  }
  console.log("--------------------------------");
}

main();
