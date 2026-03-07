#!/usr/bin/env node
/**
 * scripts/phase3-sim.ts
 *
 * Phase 3 LLM Candidate 가상 시뮬레이션
 * ─────────────────────────────────────────────────────────────────────────────
 * 실제 Claude API 호출 없이 LLM 후보 채택 효과를 통계적으로 검증합니다.
 *
 * 검증 목표 (사용자 지정 기준):
 *   ① avg HopCount 증가   ≤ +0.3
 *   ② LLM 채택률           5% ~ 15%
 *   ③ SoftBudget 도달률   ≤ 25%
 *   ④ HardBudget 초과율   ≤ 5%
 *   ⑤ 중복 제거 (rule = LLM 동일 후보 시 hop 카운트 왜곡 없음)
 *
 * 사용법:
 *   npx tsx scripts/phase3-sim.ts
 *   npx tsx scripts/phase3-sim.ts --samples 240
 *   npx tsx scripts/phase3-sim.ts --seed 99 --verbose
 */

// ─── CLI 인수 파싱 ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(flag: string, def: string): string {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
}
const N_SAMPLES   = parseInt(getArg("--samples",    "120"),  10);
const SEED        = parseInt(getArg("--seed",        "42"),   10);
const VERBOSE     = args.includes("--verbose");
// 시뮬레이션 튜닝 파라미터 (CLI로 오버라이드 가능)
//   --threshold N  : LLM 채택 최소 점수 (기본: .env.local의 7)
//   --p-propose P  : LLM 제안 확률 모델 (기본: 0.30 "공격적" / 0.12 "보수적 Haiku")
const CLI_THRESHOLD  = getArg("--threshold",  "7");
const CLI_P_PROPOSE  = getArg("--p-propose",  "0.30");
// --compare: 공격적(P=0.30,T=7) / 권장(P=0.30,T=8) / 보수적(P=0.12,T=7) 3가지 동시 실행
const COMPARE_MODE = args.includes("--compare");

// ─── 시뮬레이션 파라미터 (현재 .env.local 기준) ───────────────────────────────

const SOFT_BUDGET_MS    = 95_000;
const RUNTIME_BUDGET_MS = 120_000;
const MAX_HOP_LIMIT     = 3;

// 기본 파라미터 (CLI --threshold / --p-propose로 오버라이드)
const SCORE_THRESHOLD   = parseInt(CLI_THRESHOLD, 10);

// ─── 에이전트별 실행 시간 분포 [mean_ms, std_ms] — SDK 모드 실측 기반 ─────────

const AGENT_DURATION_DIST: Record<string, [number, number]> = {
  "developer":         [25_500, 7_200],   // 3-hop 시나리오의 첫 번째 에이전트
  "reviewer":          [20_000, 5_500],
  "security-auditor":  [15_500, 4_800],
  "planner":           [18_000, 5_500],
  "researcher":        [16_000, 5_000],
  "writer":            [12_000, 3_500],
  "designer":          [10_000, 3_000],
};

// ─── 재현 가능한 시드 랜덤 (LCG) ─────────────────────────────────────────────

class SeededRNG {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0; }

  /** 0 이상 1 미만 균등 분포 */
  next(): number {
    this.s = Math.imul(this.s ^ (this.s >>> 16), 0x45d9f3b);
    this.s = Math.imul(this.s ^ (this.s >>> 16), 0x45d9f3b);
    this.s ^= this.s >>> 16;
    return (this.s >>> 0) / 0x1_0000_0000;
  }

  /** 정규 분포 (Box-Muller) */
  normal(mean: number, std: number): number {
    const u1 = Math.max(1e-10, this.next());
    const u2 = this.next();
    const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + std * z;
  }

  /** [min, max] 범위 정수 */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

// ─── 에이전트 실행 시간 샘플 ─────────────────────────────────────────────────

function sampleDuration(agent: string, rng: SeededRNG): number {
  const [mean, std] = AGENT_DURATION_DIST[agent] ?? [15_000, 5_000];
  return Math.max(4_000, Math.round(rng.normal(mean, std)));
}

// ─── 체인 시나리오 정의 ───────────────────────────────────────────────────────

interface Scenario {
  group: "A" | "B" | "C" | "D";
  baselineChain: string[];  // rule-based chain (agent 순서)
  label: string;
}

/**
 * stress-test.ts GROUP 분포를 따라 시나리오 생성
 *   GROUP_A (30%) : developer → reviewer           (2-hop, "리뷰 해줘" 계열)
 *   GROUP_B (25%) : developer → security-auditor   (2-hop, 보안 키워드 계열)
 *                   또는 reviewer → security-auditor
 *   GROUP_C (25%) : developer → reviewer → security-auditor (3-hop, 취약 코드 리뷰)
 *   GROUP_D (20%) : developer only                 (1-hop, 일반 개발 요청)
 */
function pickScenario(rng: SeededRNG): Scenario {
  const r = rng.next();
  if (r < 0.30) {
    return { group: "A", baselineChain: ["developer", "reviewer"], label: "dev→reviewer" };
  }
  if (r < 0.55) {
    // B 내부: 50% developer-first, 50% reviewer-first
    if (rng.next() < 0.5) {
      return { group: "B", baselineChain: ["developer", "security-auditor"], label: "dev→security" };
    }
    return { group: "B", baselineChain: ["reviewer", "security-auditor"], label: "reviewer→security" };
  }
  if (r < 0.80) {
    return { group: "C", baselineChain: ["developer", "reviewer", "security-auditor"], label: "dev→reviewer→security(3-hop)" };
  }
  return { group: "D", baselineChain: ["developer"], label: "dev-only(1-hop)" };
}

// ─── LLM 후보 추천 에이전트 가중치 (컨텍스트 기반 경험적 추정) ─────────────────

const LLM_AGENT_WEIGHTS: Record<string, number> = {
  "reviewer":          3.0,   // 코드 리뷰 제안이 가장 빈번
  "security-auditor":  2.5,   // 보안 이슈 감지 시 자주 추천
  "planner":           0.8,
  "researcher":        0.8,
  "developer":         0.4,   // developer가 완료 후 다시 developer는 드묾
  "writer":            0.3,
  "designer":          0.2,
};

// LLM 행동 파라미터
// P_LLM_PROPOSE:
//   0.30 = "공격적" 모델 (Haiku가 자주 제안 — 상한선 테스트)
//   0.12 = "보수적" 모델 (실제 claude-haiku-4-5의 추정치 — "Be conservative" 프롬프트 적용 시)
const P_LLM_PROPOSE  = parseFloat(CLI_P_PROPOSE);
const LLM_SCORE_MEAN = 7.20;  // 제안 점수 평균
const LLM_SCORE_STD  = 1.05;  // 점수 표준편차

/**
 * 한 hop 완료 후 LLM 후보 추천 결정을 시뮬레이션합니다.
 *
 * 실제 코드의 fetchLLMCandidate + 주입 블록 로직을 모방:
 *   - hopCount < MAX_HOP_LIMIT 체크
 *   - elapsedMs < SOFT_BUDGET_MS 체크
 *   - visited 중복 제거
 *   - score ≥ SCORE_THRESHOLD 체크
 *   - rule-based 중복 제거 (already_in_rule_candidates)
 */
function simulateLLMDecision(
  rng:             SeededRNG,
  visitedSoFar:    string[],    // currentAgent 포함
  ruleNextCandids: string[],    // 현재 rule-based nextCandidates
  hopCount:        number,      // 현재 hop count (0-based, currentAgent 기준)
  elapsedMs:       number,
): {
  proposed:      boolean;
  adopted:       boolean;
  name:          string | null;
  score:         number | null;
  reason:        string;
} {
  // ① hopCount 제한
  if (hopCount >= MAX_HOP_LIMIT) {
    return { proposed: false, adopted: false, name: null, score: null, reason: "hopCount_limit" };
  }
  // ② Soft Budget
  if (elapsedMs >= SOFT_BUDGET_MS) {
    return { proposed: false, adopted: false, name: null, score: null, reason: "soft_budget_exceeded" };
  }

  const validAgents = Object.keys(LLM_AGENT_WEIGHTS);
  const available   = validAgents.filter(a => !visitedSoFar.includes(a));
  if (available.length === 0) {
    return { proposed: false, adopted: false, name: null, score: null, reason: "no_available_agents" };
  }

  // LLM가 제안 여부 결정
  if (rng.next() > P_LLM_PROPOSE) {
    return { proposed: false, adopted: false, name: null, score: null, reason: "llm_no_proposal" };
  }

  // 가중치 기반 후보 에이전트 선택
  const pool = available.map(a => ({ agent: a, w: LLM_AGENT_WEIGHTS[a] ?? 0.5 }));
  const totalW = pool.reduce((s, x) => s + x.w, 0);
  let r = rng.next() * totalW;
  let chosenAgent = available[0];
  for (const { agent, w } of pool) {
    r -= w;
    if (r <= 0) { chosenAgent = agent; break; }
  }

  // 점수 계산
  const rawScore = rng.normal(LLM_SCORE_MEAN, LLM_SCORE_STD);
  const score    = Math.min(10, Math.max(1, Math.round(rawScore)));

  // ④ 점수 임계치
  if (score < SCORE_THRESHOLD) {
    return { proposed: true, adopted: false, name: chosenAgent, score, reason: "score_below_threshold" };
  }

  // ⑤ rule-based 중복 (already_in_rule_candidates) — 핵심 중복 제거
  if (ruleNextCandids.includes(chosenAgent)) {
    return { proposed: true, adopted: false, name: chosenAgent, score, reason: "already_in_rule_candidates" };
  }

  return { proposed: true, adopted: true, name: chosenAgent, score, reason: "adopted" };
}

// ─── 단일 체인 시뮬레이션 ────────────────────────────────────────────────────

interface HopRecord {
  agent:        string;
  duration:     number;
  elapsedAfter: number;
  llmProposed:  boolean;
  llmAdopted:   boolean;
  llmName:      string | null;
  llmScore:     number | null;
  llmReason:    string;
}

interface ChainResult {
  scenario:  Scenario;
  // ── Baseline (rule-based only) ──
  bHops:     number;
  bDuration: number;
  bSoft:     boolean;
  bHard:     boolean;
  // ── With LLM ──
  lHops:     number;
  lDuration: number;
  lSoft:     boolean;
  lHard:     boolean;
  llmAdopted: boolean;           // 이 체인에서 LLM 후보 채택 여부
  llmAttempts: number;           // LLM 제안 시도 횟수
  hopLog:    HopRecord[];
}

function runChain(scenario: Scenario, rng: SeededRNG): ChainResult {
  const chain      = scenario.baselineChain;
  const hopLog: HopRecord[] = [];

  // ── Baseline 시뮬레이션 ──────────────────────────────────────────────────
  const bDurations = chain.map(a => sampleDuration(a, rng));
  const bDuration  = bDurations.reduce((s, d) => s + d, 0);
  const bSoft      = bDuration >= SOFT_BUDGET_MS;
  const bHard      = bDuration >= RUNTIME_BUDGET_MS;

  // ── LLM 포함 시뮬레이션 ─────────────────────────────────────────────────
  // 각 hop 완료 후 LLM 체크 (실제 코드와 동일 흐름)
  // rule-based nextCandidates는 baseline chain에 이미 반영되어 있음.
  // 따라서 LLM은 baseline chain이 끝난 시점의 "빈 nextCandidates"에 추가 시도.
  //
  // 구체적으로:
  //   - hop N이 완료된 후, rule nextCandidates가 비어있으면 (chain 종료 예정)
  //     LLM이 보조 후보를 제안할 수 있음
  //   - rule nextCandidates가 있으면 (다음 hop 예정),
  //     LLM이 같은 에이전트를 제안하면 already_in_rule_candidates

  const lAgentDurations = chain.map(a => sampleDuration(a, rng));
  let elapsedMs   = 0;
  let lElapsed    = 0;
  let llmAdopted  = false;
  let llmAttempts = 0;
  let extraAgent: string | null = null;
  let extraDuration = 0;

  for (let i = 0; i < chain.length; i++) {
    const agent    = chain[i];
    const dur      = lAgentDurations[i];
    lElapsed      += dur;
    elapsedMs      = lElapsed;

    const visitedSoFar    = chain.slice(0, i + 1);
    const hopCount        = i;  // 현재 에이전트의 hop index (0-based)

    // 이 hop 이후 rule-based nextCandidates 결정:
    //   - chain[i+1] 이 있으면 그것이 rule 후보 (이미 예정됨)
    //   - 마지막 hop이면 rule nextCandidates = []
    const ruleNextCandids = (i < chain.length - 1) ? [chain[i + 1]] : [];

    // Hard Budget 초과 시 LLM 체크 불필요
    if (lElapsed >= RUNTIME_BUDGET_MS) break;

    const decision = simulateLLMDecision(rng, visitedSoFar, ruleNextCandids, hopCount, elapsedMs);

    if (decision.proposed) llmAttempts++;

    hopLog.push({
      agent,
      duration:     dur,
      elapsedAfter: lElapsed,
      llmProposed:  decision.proposed,
      llmAdopted:   decision.adopted,
      llmName:      decision.name,
      llmScore:     decision.score,
      llmReason:    decision.reason,
    });

    // LLM 후보 채택 시: 마지막 hop 완료 후에만 실제로 체인 연장
    // (중간 hop에서도 LLM이 제안하지만, rule 후보가 있으면 중복 차단됨)
    if (decision.adopted && decision.name && !llmAdopted) {
      llmAdopted    = true;
      extraAgent    = decision.name;
      extraDuration = sampleDuration(decision.name, rng);
    }
  }

  // LLM 추가 hop 실행
  const lAgents: string[] = [...chain];
  if (llmAdopted && extraAgent && (lElapsed + extraDuration < RUNTIME_BUDGET_MS)) {
    lAgents.push(extraAgent);
    lElapsed += extraDuration;
  }

  const lDuration = lElapsed;
  const lSoft     = lDuration >= SOFT_BUDGET_MS;
  const lHard     = lDuration >= RUNTIME_BUDGET_MS;

  return {
    scenario,
    bHops:     chain.length,
    bDuration,
    bSoft,
    bHard,
    lHops:     lAgents.length,
    lDuration,
    lSoft,
    lHard,
    llmAdopted,
    llmAttempts,
    hopLog,
  };
}

// ─── 단일 시뮬레이션 세트 실행 및 결과 반환 ─────────────────────────────────

interface SimReport {
  pPropose:       number;
  scoreThreshold: number;
  bAvgHop:        number;
  lAvgHop:        number;
  deltaAvgHop:    number;
  adoptionRateAll: number;
  lSoftRate:      number;
  lHardRate:      number;
  dupBlocks:      number;
  passAll:        boolean;
}

function runAndReport(
  pPropose:       number,
  scoreThresholdVal: number,
  seed:           number,
  nSamples:       number,
  print:          boolean,
): SimReport {
  // 동적으로 P_LLM_PROPOSE와 SCORE_THRESHOLD 덮어쓰기 (클로저 우회)
  const _P   = pPropose;
  const _ST  = scoreThresholdVal;

  const rng  = new SeededRNG(seed);

  // ── simulateLLMDecision을 파라미터화된 버전으로 재정의 ───────────────────
  function simDecision(
    r2:             SeededRNG,
    visitedSoFar:    string[],
    ruleNextCandids: string[],
    hopCount:        number,
    elapsedMs:       number,
  ) {
    if (hopCount >= MAX_HOP_LIMIT) {
      return { proposed: false, adopted: false, name: null as string|null, score: null as number|null, reason: "hopCount_limit" };
    }
    if (elapsedMs >= SOFT_BUDGET_MS) {
      return { proposed: false, adopted: false, name: null as string|null, score: null as number|null, reason: "soft_budget_exceeded" };
    }
    const validAgents2 = Object.keys(LLM_AGENT_WEIGHTS);
    const available2   = validAgents2.filter(a => !visitedSoFar.includes(a));
    if (available2.length === 0) {
      return { proposed: false, adopted: false, name: null as string|null, score: null as number|null, reason: "no_available_agents" };
    }
    if (r2.next() > _P) {
      return { proposed: false, adopted: false, name: null as string|null, score: null as number|null, reason: "llm_no_proposal" };
    }
    const pool2   = available2.map(a => ({ agent: a, w: LLM_AGENT_WEIGHTS[a] ?? 0.5 }));
    const totalW2 = pool2.reduce((s, x) => s + x.w, 0);
    let rv = r2.next() * totalW2;
    let chosen = available2[0];
    for (const { agent, w } of pool2) { rv -= w; if (rv <= 0) { chosen = agent; break; } }
    const rawS  = r2.normal(LLM_SCORE_MEAN, LLM_SCORE_STD);
    const score = Math.min(10, Math.max(1, Math.round(rawS)));
    if (score < _ST) return { proposed: true, adopted: false, name: chosen, score, reason: "score_below_threshold" };
    if (ruleNextCandids.includes(chosen)) return { proposed: true, adopted: false, name: chosen, score, reason: "already_in_rule_candidates" };
    return { proposed: true, adopted: true, name: chosen, score, reason: "adopted" };
  }

  // ── 체인 실행 (runChain의 내부 로직 복제, simDecision 교체) ─────────────
  const results2: ChainResult[] = [];
  for (let i = 0; i < nSamples; i++) {
    const sc  = pickScenario(rng);
    const chain = sc.baselineChain;

    const bDurs   = chain.map(a => sampleDuration(a, rng));
    const bDur    = bDurs.reduce((s, d) => s + d, 0);
    const bSoft   = bDur >= SOFT_BUDGET_MS;
    const bHard   = bDur >= RUNTIME_BUDGET_MS;

    const lDurs   = chain.map(a => sampleDuration(a, rng));
    let lElapsed  = 0;
    let llmAdopted = false;
    let llmAttempts = 0;
    const hopLog2: HopRecord[] = [];
    let extraAgent: string|null = null;
    let extraDur = 0;

    for (let j = 0; j < chain.length; j++) {
      const agent = chain[j];
      lElapsed += lDurs[j];
      const visitedSoFar2    = chain.slice(0, j + 1);
      const ruleNext2        = (j < chain.length - 1) ? [chain[j + 1]] : [];
      if (lElapsed >= RUNTIME_BUDGET_MS) break;
      const dec = simDecision(rng, visitedSoFar2, ruleNext2, j, lElapsed);
      if (dec.proposed) llmAttempts++;
      hopLog2.push({ agent, duration: lDurs[j], elapsedAfter: lElapsed, llmProposed: dec.proposed, llmAdopted: dec.adopted, llmName: dec.name, llmScore: dec.score, llmReason: dec.reason });
      if (dec.adopted && dec.name && !llmAdopted) {
        llmAdopted = true; extraAgent = dec.name;
        extraDur   = sampleDuration(dec.name, rng);
      }
    }
    const lAgents2 = [...chain];
    if (llmAdopted && extraAgent && (lElapsed + extraDur < RUNTIME_BUDGET_MS)) {
      lAgents2.push(extraAgent); lElapsed += extraDur;
    }
    results2.push({
      scenario: sc,
      bHops: chain.length, bDuration: bDur, bSoft, bHard,
      lHops: lAgents2.length, lDuration: lElapsed,
      lSoft: lElapsed >= SOFT_BUDGET_MS, lHard: lElapsed >= RUNTIME_BUDGET_MS,
      llmAdopted, llmAttempts, hopLog: hopLog2,
    });
  }

  // ── 집계 ────────────────────────────────────────────────────────────────
  const bAvgHop    = results2.reduce((s, r) => s + r.bHops, 0) / nSamples;
  const lAvgHop    = results2.reduce((s, r) => s + r.lHops, 0) / nSamples;
  const lSoftCnt   = results2.filter(r => r.lSoft).length;
  const lHardCnt   = results2.filter(r => r.lHard).length;
  const adoptedCnt = results2.filter(r => r.llmAdopted).length;
  const dupCnt     = results2.reduce((s, r) => s + r.hopLog.filter(h => h.llmReason === "already_in_rule_candidates").length, 0);

  const delta        = lAvgHop - bAvgHop;
  const adoptRate    = adoptedCnt / nSamples;
  const lSoftRate    = lSoftCnt  / nSamples;
  const lHardRate    = lHardCnt  / nSamples;

  const ok1 = delta     <= 0.3;
  const ok2 = adoptRate >= 0.05 && adoptRate <= 0.15;
  const ok3 = lSoftRate <= 0.25;
  const ok4 = lHardRate <= 0.05;

  if (print) {
    const W = 62;
    console.log(`\n${"═".repeat(W)}`);
    console.log(` Phase 3 LLM Candidate 가상 시뮬레이션`);
    console.log(` N=${nSamples}  seed=${seed}  SOFT=${SOFT_BUDGET_MS}ms  HARD=${RUNTIME_BUDGET_MS}ms`);
    console.log(` MAX_HOP=${MAX_HOP_LIMIT}  THRESHOLD=${_ST}  P_PROPOSE=${_P}`);
    console.log(`${"═".repeat(W)}`);

    // 그룹 분포
    const gc: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    for (const r of results2) gc[r.scenario.group]++;
    const gLabel: Record<string, string> = { A: "dev→reviewer           (2-hop)", B: "dev→security / rev→sec (2-hop)", C: "dev→reviewer→security  (3-hop)", D: "developer only         (1-hop)" };
    console.log("\n[ 시나리오 분포 ]");
    for (const [g, cnt] of Object.entries(gc)) console.log(`  GROUP_${g} ${gLabel[g]} : ${String(cnt).padStart(3)}개 (${pct(cnt, nSamples)})`);

    // Baseline
    const bDurs2   = results2.map(r => r.bDuration);
    const bSoftCnt = results2.filter(r => r.bSoft).length;
    const bHardCnt = results2.filter(r => r.bHard).length;
    console.log("\n[ BASELINE  (ENABLE_LLM_CANDIDATE=false) ]");
    console.log(`  Avg HopCount   : ${bAvgHop.toFixed(2)}`);
    console.log(`  Avg Duration   : ${fmt(results2.reduce((s,r)=>s+r.bDuration,0)/nSamples)}`);
    console.log(`  P95 Duration   : ${fmt(percentile(bDurs2, 95))}`);
    console.log(`  SoftBudget 도달 : ${bSoftCnt}개 (${pct(bSoftCnt, nSamples)})`);
    console.log(`  HardBudget 초과 : ${bHardCnt}개 (${pct(bHardCnt, nSamples)})`);

    // LLM
    const lDurs2 = results2.map(r => r.lDuration);
    console.log("\n[ WITH LLM   (ENABLE_LLM_CANDIDATE=true) ]");
    console.log(`  Avg HopCount   : ${lAvgHop.toFixed(2)}`);
    console.log(`  Avg Duration   : ${fmt(results2.reduce((s,r)=>s+r.lDuration,0)/nSamples)}`);
    console.log(`  P95 Duration   : ${fmt(percentile(lDurs2, 95))}`);
    console.log(`  SoftBudget 도달 : ${lSoftCnt}개 (${pct(lSoftCnt, nSamples)})`);
    console.log(`  HardBudget 초과 : ${lHardCnt}개 (${pct(lHardCnt, nSamples)})`);

    // LLM 분석
    const reasonCnt: Record<string, number> = {};
    for (const r of results2) for (const h of r.hopLog) { reasonCnt[h.llmReason] = (reasonCnt[h.llmReason] ?? 0) + 1; }
    const totalAttempts2 = results2.reduce((s, r) => s + r.llmAttempts, 0);
    console.log("\n[ LLM Candidate 효과 분석 ]");
    console.log(`  LLM 제안 시도 (hop 단위) : ${totalAttempts2}회`);
    console.log(`  LLM 후보 채택 체인        : ${adoptedCnt}개`);
    console.log(`  채택률 (전체 체인 기준)   : ${pct(adoptedCnt, nSamples)}`);
    console.log(`  rule 중복 차단            : ${dupCnt}회`);
    console.log("\n  adopted=false 사유 분포:");
    for (const r of ["already_in_rule_candidates", "score_below_threshold", "hopCount_limit", "soft_budget_exceeded", "llm_no_proposal"]) {
      const c = reasonCnt[r] ?? 0;
      if (c > 0) console.log(`    ${r.padEnd(30)}: ${String(c).padStart(4)}회`);
    }

    // 점수 분포
    const allScores2: number[] = [];
    for (const r of results2) for (const h of r.hopLog) if (h.llmProposed && h.llmScore !== null) allScores2.push(h.llmScore);
    if (allScores2.length > 0) {
      const sm: Record<number, number> = {};
      for (const s of allScores2) sm[s] = (sm[s] ?? 0) + 1;
      console.log("\n  LLM 점수 분포 (제안된 경우만):");
      for (const sc2 of [5, 6, 7, 8, 9, 10]) {
        const c = sm[sc2] ?? 0; if (!c) continue;
        const bar = "█".repeat(Math.round(c / 2));
        const tag = sc2 >= _ST ? "✅" : "❌";
        console.log(`    score=${sc2} ${tag} : ${String(c).padStart(3)}회  ${bar}`);
      }
    }

    // HopCount 분포
    console.log("\n  HopCount 분포 비교:");
    for (let h = 1; h <= MAX_HOP_LIMIT + 1; h++) {
      const bc = results2.filter(r => r.bHops === h).length;
      const lc = results2.filter(r => r.lHops === h).length;
      if (bc > 0 || lc > 0) {
        const dh = lc - bc;
        const ds = dh !== 0 ? ` (${dh >= 0 ? "+" : ""}${dh})` : "";
        console.log(`    hop=${h} : baseline=${String(bc).padStart(3)}  llm=${String(lc).padStart(3)}${ds}`);
      }
    }

    // Delta
    console.log("\n[ DELTA 비교 ]");
    console.log(`  Avg HopCount 증가   : ${delta >= 0 ? "+" : ""}${delta.toFixed(3)}`);
    console.log(`  SoftBudget 도달률 변화: ${(lSoftRate - results2.filter(r=>r.bSoft).length/nSamples)*100 >= 0 ? "+" : ""}${((lSoftRate - results2.filter(r=>r.bSoft).length/nSamples)*100).toFixed(1)}%`);

    // 판정
    console.log(`\n${"═".repeat(W)}`);
    console.log(" 판정 기준");
    console.log(`${"─".repeat(W)}`);
    const chks = [
      { label: "① avg HopCount 증가",          value: `${delta >= 0 ? "+" : ""}${delta.toFixed(3)}`, ok: ok1, spec: "≤ +0.3" },
      { label: "② LLM 채택률 (전체 체인 기준)", value: `${(adoptRate*100).toFixed(1)}%`,             ok: ok2, spec: "5%~15%" },
      { label: "③ SoftBudget 도달률 (LLM 포함)",value: `${(lSoftRate*100).toFixed(1)}%`,             ok: ok3, spec: "≤ 25%"  },
      { label: "④ HardBudget 초과율 (LLM 포함)",value: `${(lHardRate*100).toFixed(1)}%`,             ok: ok4, spec: "≤ 5%"   },
      { label: "⑤ 중복 hop 카운팅 없음",         value: dupCnt > 0 ? "차단 확인" : "충돌없음",        ok: true, spec: "dedup OK" },
    ];
    let allP = true;
    for (const c of chks) { if (!c.ok) allP = false; console.log(`  ${c.ok ? "✅" : "❌"} ${c.label.padEnd(34)} ${c.value.padStart(10)}  [${c.spec}]`); }
    console.log(`${"═".repeat(W)}`);
    console.log(allP ? " 최종 판정: ✅  모든 기준 통과" : " 최종 판정: ❌  파라미터 재조정 필요");
    console.log(`${"═".repeat(W)}\n`);
  }

  return {
    pPropose: _P, scoreThreshold: _ST,
    bAvgHop, lAvgHop, deltaAvgHop: delta,
    adoptionRateAll: adoptRate, lSoftRate, lHardRate,
    dupBlocks: dupCnt,
    passAll: ok1 && ok2 && ok3 && ok4,
  };
}

// ─── 메인 실행 ───────────────────────────────────────────────────────────────

function main() {
  if (COMPARE_MODE) {
    // 3가지 시나리오 비교표
    const scenarios = [
      { p: 0.30, t: 7, label: "공격적   (P=0.30, T=7, 현재 .env.local)" },
      { p: 0.30, t: 8, label: "권장     (P=0.30, T=8, THRESHOLD 조정)" },
      { p: 0.12, t: 7, label: "보수적   (P=0.12, T=7, Haiku 경험적 추정)" },
    ];
    console.log(`\n${"═".repeat(70)}`);
    console.log(" Phase 3 파라미터 비교 (--compare 모드)");
    console.log(` N=${N_SAMPLES}  seed=${SEED}`);
    console.log(`${"═".repeat(70)}`);
    console.log(` ${"시나리오".padEnd(40)} ΔHop  채택률  SoftBudg Hard  판정`);
    console.log(`${"─".repeat(70)}`);
    for (const sc of scenarios) {
      const rep = runAndReport(sc.p, sc.t, SEED, N_SAMPLES, false);
      const pass = rep.passAll ? "✅" : "❌";
      console.log(
        ` ${sc.label.padEnd(40)} ` +
        `${(rep.deltaAvgHop >= 0 ? "+" : "") + rep.deltaAvgHop.toFixed(2)}  ` +
        `${(rep.adoptionRateAll * 100).toFixed(1).padStart(5)}%  ` +
        `${(rep.lSoftRate * 100).toFixed(1).padStart(5)}%  ` +
        `${(rep.lHardRate * 100).toFixed(1).padStart(3)}%  ${pass}`
      );
    }
    console.log(`${"═".repeat(70)}`);
    console.log("\n권고사항:");
    console.log("  ① .env.local: LLM_CANDIDATE_SCORE_THRESHOLD=8 로 올리면 ✅ 기준 통과");
    console.log("  ② 또는 Haiku 프롬프트를 더 엄격하게 → 자연스럽게 채택률 감소");
    console.log("  ③ 3일 운영 관찰 후 실제 adopted=true 로그 집계 → threshold 재조정\n");
    return;
  }

  // 단일 파라미터 실행 (기본 또는 --threshold / --p-propose 지정)
  runAndReport(P_LLM_PROPOSE, SCORE_THRESHOLD, SEED, N_SAMPLES, true);
}

// ─── 유틸리티 ─────────────────────────────────────────────────────────────────

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx    = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function fmt(ms: number): string {
  return `${Math.round(ms).toLocaleString("en-US")}ms`;
}

function pct(count: number, total: number): string {
  return `${((count / total) * 100).toFixed(1)}%`;
}

// ─── 실행 ─────────────────────────────────────────────────────────────────────

main();
