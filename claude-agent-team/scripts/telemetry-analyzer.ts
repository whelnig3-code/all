/**
 * telemetry-analyzer.ts
 * CHAIN_SUMMARY 로그 집계 분석 스크립트
 *
 * 목적: 1주일간 누적된 CHAIN_SUMMARY 로그를 파싱하여
 *       데이터 기반 Soft Budget 수치를 결정하기 위한 기초 통계를 출력한다.
 *
 * 실행 방법:
 *   node node_modules/tsx/dist/cli.mjs scripts/telemetry-analyzer.ts <logfile>
 *
 * 예시:
 *   node node_modules/tsx/dist/cli.mjs scripts/telemetry-analyzer.ts server.log
 *   node node_modules/tsx/dist/cli.mjs scripts/telemetry-analyzer.ts chain_week.log
 *
 * 입력 로그 형식 (1줄 1레코드):
 *   [METRIC] CHAIN_SUMMARY durationMs=37421 hopCount=2 status=COMPLETED agents=developer,reviewer
 */

import * as fs from "fs";
import * as path from "path";

// ─── CLI 인자 처리 ────────────────────────────────────────────────────────────

const logFile = process.argv[2];

if (!logFile) {
  console.error("Usage: node telemetry-analyzer.js <logfile>");
  console.error("  예: node node_modules/tsx/dist/cli.mjs scripts/telemetry-analyzer.ts server.log");
  process.exit(1);
}

const filePath = path.resolve(logFile);

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

// ─── 로그 파싱 ────────────────────────────────────────────────────────────────

// [METRIC] CHAIN_SUMMARY durationMs=<n> hopCount=<n> status=<word> agents=<...>
const CHAIN_SUMMARY_RE =
  /\[METRIC\] CHAIN_SUMMARY durationMs=(\d+) hopCount=(\d+) status=(\S+) agents=(.+)/;

const content = fs.readFileSync(filePath, "utf-8");
const lines = content.split("\n");

interface ChainRecord {
  durationMs: number;
  hopCount:   number;
  status:     string;
  agents:     string;
}

const records: ChainRecord[] = [];

for (const line of lines) {
  const match = CHAIN_SUMMARY_RE.exec(line);
  if (!match) continue; // 포맷 불일치 라인은 무시

  const durationMs = Number(match[1]);
  const hopCount   = Number(match[2]);
  const status     = match[3];
  const agents     = match[4].trim();

  if (isNaN(durationMs) || isNaN(hopCount)) continue; // 파싱 실패 라인 무시

  records.push({ durationMs, hopCount, status, agents });
}

if (records.length === 0) {
  console.log("No CHAIN_SUMMARY records found in:", filePath);
  process.exit(0);
}

// ─── 통계 계산 ────────────────────────────────────────────────────────────────

const totalSamples = records.length;

// 1️⃣ 평균 durationMs
const sumDuration = records.reduce((sum, r) => sum + r.durationMs, 0);
const avgDuration = Math.round(sumDuration / totalSamples);

// 5️⃣ P95 durationMs
const sortedDurations = records.map(r => r.durationMs).sort((a, b) => a - b);
const p95Index   = Math.ceil(totalSamples * 0.95) - 1;
const p95Duration = sortedDurations[p95Index];

// 2️⃣ 평균 hopCount
const sumHop     = records.reduce((sum, r) => sum + r.hopCount, 0);
const avgHopCount = (sumHop / totalSamples).toFixed(2);

// 6️⃣ 최대 hopCount
const maxHopCount = records.reduce((max, r) => (r.hopCount > max ? r.hopCount : max), 0);

// 3️⃣ hopCount ≥ 3 비율 (%)
const hop3PlusCount = records.filter(r => r.hopCount >= 3).length;
const hop3PlusRatio = ((hop3PlusCount / totalSamples) * 100).toFixed(1);

// 4️⃣ status=BUDGET_EXCEEDED 비율 (%)
const budgetExceededCount = records.filter(r => r.status === "BUDGET_EXCEEDED").length;
const budgetExceededRatio = ((budgetExceededCount / totalSamples) * 100).toFixed(1);

// Soft Budget 제안 수치
const suggestedSoftP95  = p95Duration;                         // P95 그대로 사용
const suggestedSoftAvg  = Math.round(avgDuration * 1.2);       // Avg * 1.2

// ─── 결과 출력 ────────────────────────────────────────────────────────────────

const LINE = "=================================";

console.log(`\n===== CHAIN ANALYSIS RESULT =====`);
console.log(`Total Samples:         ${totalSamples}`);
console.log(`Avg Duration:          ${avgDuration} ms`);
console.log(`P95 Duration:          ${p95Duration} ms`);
console.log(`Avg HopCount:          ${avgHopCount}`);
console.log(`Max HopCount:          ${maxHopCount}`);
console.log(`Hop ≥3 Ratio:          ${hop3PlusRatio} %`);
console.log(`Budget Exceeded Ratio: ${budgetExceededRatio} %`);
console.log(LINE);

console.log(`\nSuggested Soft Budget (P95 기준):  ${suggestedSoftP95} ms`);
console.log(`Suggested Soft Budget (Avg * 1.2): ${suggestedSoftAvg} ms`);
console.log("");
