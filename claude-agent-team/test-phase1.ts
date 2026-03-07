/**
 * Phase 1 단위 테스트 (수정판)
 */
import { routeMessage, createRoutingContext } from "./src/lib/agent-router";

let pass = 0;
let fail = 0;

function assert(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { console.log(`  ✅ PASS: ${label}`); pass++; }
  else {
    console.error(`  ❌ FAIL: ${label}`);
    console.error(`     expected: ${JSON.stringify(expected)}`);
    console.error(`     actual  : ${JSON.stringify(actual)}`);
    fail++;
  }
}

// TC1: Shadow OFF
console.log("\n[TC1] Shadow OFF → nextCandidates = undefined");
{
  process.env.ENABLE_SHADOW_MULTI_HOP = "false";
  process.env.ENABLE_SHADOW_SCORING   = "false";
  process.env.ENABLE_COST_SIMULATION  = "false";
  process.env.DEPTH_STRATEGY          = "hard-cap";
  process.env.MAX_HOP_LIMIT           = "3";
  const ctx = createRoutingContext();
  const result = routeMessage("개발해줘", undefined, ctx);
  assert("nextCandidates = undefined", result.nextCandidates, undefined);
}

// TC2: Shadow ON, hard-cap, hopCount=0, 신호 없음 → developer 선택, nextCandidates=[]
console.log("\n[TC2] Shadow ON + hard-cap + hopCount=0 + 신호 없음 → developer, nextCandidates=[]");
{
  process.env.ENABLE_SHADOW_MULTI_HOP = "true";
  process.env.ENABLE_SHADOW_SCORING   = "false";
  process.env.ENABLE_COST_SIMULATION  = "false";
  process.env.DEPTH_STRATEGY          = "hard-cap";
  process.env.MAX_HOP_LIMIT           = "3";
  const ctx = createRoutingContext();
  const result = routeMessage("버그만 고쳐줘", undefined, ctx);
  // "버그"(priority 7) → developer
  // shadow: 리뷰/보안 키워드 없음 → []
  assert("selectedAgent = developer", result.selectedAgent, "developer");
  assert("nextCandidates = []", result.nextCandidates, []);
}

// TC3: Shadow ON, hard-cap, hopCount=3 → 즉시 차단
console.log("\n[TC3] Shadow ON + hard-cap + hopCount=3 → nextCandidates=[]");
{
  process.env.ENABLE_SHADOW_MULTI_HOP = "true";
  process.env.ENABLE_SHADOW_SCORING   = "false";
  process.env.ENABLE_COST_SIMULATION  = "false";
  process.env.DEPTH_STRATEGY          = "hard-cap";
  process.env.MAX_HOP_LIMIT           = "3";
  const ctx = { hopCount: 3, visited: [], currentAgent: undefined as any, sourceAgent: undefined };
  const result = routeMessage("버그만 고쳐줘", undefined, ctx);
  assert("nextCandidates = [] (hard-cap blocked)", result.nextCandidates, []);
}

// TC4: Shadow ON, cost simulation, 충분한 예산 → 후보 반환
console.log("\n[TC4] Shadow ON + cost simulation + 충분한 예산 → 후보 반환");
{
  process.env.ENABLE_SHADOW_MULTI_HOP  = "true";
  process.env.ENABLE_SHADOW_SCORING    = "false";
  process.env.ENABLE_COST_SIMULATION   = "true";
  process.env.DEPTH_STRATEGY           = "hard-cap";
  process.env.MAX_HOP_LIMIT            = "3";
  process.env.MAX_LATENCY_BUDGET_MS    = "40000";
  process.env.MAX_TOKEN_BUDGET         = "50000";
  const ctx = createRoutingContext();
  // "분析해줘 보안도 확인해줘" → gate: analysis-not-developer → reviewer
  // shadow: reviewer + "보안" → [security-auditor]
  // chain: [reviewer, security-auditor] = 1500+2200=3700 tokens < 50000 OK
  const result = routeMessage("분析해줘 보안도 확인해줘", undefined, ctx);
  assert("selectedAgent = reviewer (gate)", result.selectedAgent, "reviewer");
  assert("nextCandidates includes security-auditor", result.nextCandidates?.includes("security-auditor"), true);
}

// TC5: Shadow ON, cost simulation, 토큰 초과 → nextCandidates=[]
console.log("\n[TC5] Shadow ON + cost simulation + 토큰 초과 → nextCandidates=[]");
{
  process.env.ENABLE_SHADOW_MULTI_HOP  = "true";
  process.env.ENABLE_SHADOW_SCORING    = "false";
  process.env.ENABLE_COST_SIMULATION   = "true";
  process.env.DEPTH_STRATEGY           = "hard-cap";
  process.env.MAX_HOP_LIMIT            = "3";
  process.env.MAX_LATENCY_BUDGET_MS    = "40000";
  process.env.MAX_TOKEN_BUDGET         = "100";  // 즉시 초과
  const ctx = createRoutingContext();
  const result = routeMessage("분析해줘 보안도 확인해줘", undefined, ctx);
  assert("nextCandidates = [] (token exceeded)", result.nextCandidates, []);
  process.env.MAX_TOKEN_BUDGET = "5000"; // 복원
}

// TC6: Shadow ON, soft-cap, hopCount=2 → 감점 2×2=4
console.log("\n[TC6] Shadow ON + soft-cap + hopCount=2 → score -= 4 (2×2)");
{
  process.env.ENABLE_SHADOW_MULTI_HOP  = "true";
  process.env.ENABLE_SHADOW_SCORING    = "true";
  process.env.ENABLE_COST_SIMULATION   = "false";
  process.env.DEPTH_STRATEGY           = "soft-cap";
  process.env.MAX_HOP_LIMIT            = "3";
  const ctx = { hopCount: 2, visited: [], currentAgent: undefined as any, sourceAgent: undefined };
  // gate → reviewer, nextCandidates=[security-auditor], score=+5-4=1
  const result = routeMessage("분析해줘 보안도 확인해줘", undefined, ctx);
  assert("selectedAgent = reviewer (gate)", result.selectedAgent, "reviewer");
  assert("nextCandidates[0] = security-auditor (score=1)", result.nextCandidates?.[0], "security-auditor");
}

// TC7: Shadow ON, decay, hopCount=2 → 지수 2^2=4
console.log("\n[TC7] Shadow ON + decay + hopCount=2 → score -= 4 (2^2)");
{
  process.env.ENABLE_SHADOW_MULTI_HOP  = "true";
  process.env.ENABLE_SHADOW_SCORING    = "true";
  process.env.ENABLE_COST_SIMULATION   = "false";
  process.env.DEPTH_STRATEGY           = "decay";
  const ctx = { hopCount: 2, visited: [], currentAgent: undefined as any, sourceAgent: undefined };
  const result = routeMessage("분析해줘 보안도 확인해줘", undefined, ctx);
  assert("selectedAgent = reviewer (gate)", result.selectedAgent, "reviewer");
  assert("nextCandidates[0] = security-auditor (score=1)", result.nextCandidates?.[0], "security-auditor");
}

// 결과
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`결과: ${pass} passed / ${fail} failed`);
if (fail === 0) console.log("🎉 모든 Phase 1 테스트 통과!");
else process.exit(1);
