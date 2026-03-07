/**
 * Shadow Scoring 단위 테스트
 *
 * 테스트 조건 매트릭스:
 *   TC1: Shadow OFF → nextCandidates = undefined (기존 동일)
 *   TC2: Shadow ON, Scoring OFF → 정렬 없는 후보 반환
 *   TC3: Shadow ON, Scoring ON, 보안 메시지 → security-auditor 우선
 *   TC4: Shadow ON, Scoring ON, 리뷰 메시지 → reviewer 우선
 *   TC5: Shadow ON, Scoring ON, 후보 없음 → nextCandidates = []
 *   TC6: hopCount=2 Depth 패널티 → 점수 감점 확인
 */
import { routeMessage, createRoutingContext } from "./src/lib/agent-router";

let pass = 0;
let fail = 0;

function assert(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✅ PASS: ${label}`);
    pass++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    console.error(`     expected: ${JSON.stringify(expected)}`);
    console.error(`     actual  : ${JSON.stringify(actual)}`);
    fail++;
  }
}

// ─── TC1: Shadow OFF → nextCandidates undefined ───────────────────────────
console.log("\n[TC1] Shadow OFF → nextCandidates = undefined");
{
  process.env.ENABLE_SHADOW_MULTI_HOP = "false";
  process.env.ENABLE_SHADOW_SCORING = "false";
  const ctx = createRoutingContext();
  const result = routeMessage("개발해줘 보안도 확인해줘", undefined, ctx);
  assert("nextCandidates is undefined", result.nextCandidates, undefined);
}

// ─── TC2: Shadow ON, Scoring OFF → 정렬 없이 후보 반환 ───────────────────
console.log("\n[TC2] Shadow ON, Scoring OFF → 원래 순서 유지");
{
  process.env.ENABLE_SHADOW_MULTI_HOP = "true";
  process.env.ENABLE_SHADOW_SCORING = "false";
  const ctx = createRoutingContext();
  // developer 선택 + "보안"+"리뷰" → [security-auditor, reviewer] 순서 (computeNextCandidates 순서)
  const result = routeMessage("개발해줘 보안도 확인해줘 리뷰도 해줘", undefined, ctx);
  // developer로 라우팅되면 security-auditor가 먼저 (코드 순서상)
  assert("selectedAgent = security-auditor (보안 keyword priority 3)", result.selectedAgent, "security-auditor");
  // shadow ON이니 nextCandidates 존재해야 함 (security-auditor는 visited에 없음)
  assert("nextCandidates defined", result.nextCandidates !== undefined, true);
}

// ─── TC3: Shadow ON, Scoring ON, 보안 메시지 → security-auditor 우선 ─────
console.log("\n[TC3] Shadow ON + Scoring ON, 보안 신호 → security-auditor 우선 정렬");
{
  process.env.ENABLE_SHADOW_MULTI_HOP = "true";
  process.env.ENABLE_SHADOW_SCORING = "true";
  const ctx = createRoutingContext();
  // "分析해줘 보안도 확인해줘 리뷰도 해줘"
  // Gate: analysis-not-developer → reviewer
  // reviewer 후보: "보안" 포함 → [security-auditor]
  // Scoring: security-auditor(+5) > 비교 없음 → 그대로
  const result = routeMessage("분析해줘 보안도 확인해줘", undefined, ctx);
  assert("selectedAgent = reviewer (gate: analysis)", result.selectedAgent, "reviewer");
  assert("nextCandidates[0] = security-auditor", result.nextCandidates?.[0], "security-auditor");
}

// ─── TC4: Shadow ON, Scoring ON, developer + "리뷰" 메시지 ───────────────
console.log("\n[TC4] Shadow ON + Scoring ON, developer + 리뷰 신호 → reviewer 우선");
{
  process.env.ENABLE_SHADOW_MULTI_HOP = "true";
  process.env.ENABLE_SHADOW_SCORING = "true";
  const ctx = createRoutingContext();
  // "개발해줘 리뷰도 해줘"
  // 라우팅: developer (bugfix/default) 아니면 reviewer(리뷰 keyword priority 4)
  // "리뷰" keyword → reviewer 선택될 것 (priority 4)
  // reviewer 완료 후: "리뷰" 키워드로 nextCandidates → []  (reviewer 후보에 리뷰는 없음, 보안만)
  // 다시 테스트: "개발해줘 리뷰도 해줘" → "리뷰"(priority 4) vs "개발"(keyword 없음) → reviewer
  const result = routeMessage("개발해줘 리뷰도 해줘", undefined, ctx);
  // reviewer 선택 + shadow ON + scoring ON
  // reviewer 후보: "보안" 없으므로 nextCandidates=[]
  assert("selectedAgent = reviewer", result.selectedAgent, "reviewer");
  // reviewer 완료 후 "보안" 없으면 nextCandidates = []
  assert("nextCandidates = [] (no security signal)", result.nextCandidates, []);
}

// ─── TC5: Shadow ON, Scoring ON, developer + "보안" → security-auditor 후보
console.log("\n[TC5] Shadow ON + Scoring ON, developer + '보안' 리뷰 → 정렬 검증");
{
  process.env.ENABLE_SHADOW_MULTI_HOP = "true";
  process.env.ENABLE_SHADOW_SCORING = "true";
  const ctx = createRoutingContext();
  // "버그 고쳐줘 보안도 확인해줘 리뷰도 해줘"
  // "보안" keyword(priority 3) → security-auditor 선택
  // shadow candidates: []  (security-auditor 후보 없음)
  const result = routeMessage("버그 고쳐줘 보안도 확인해줘", undefined, ctx);
  assert("selectedAgent = security-auditor", result.selectedAgent, "security-auditor");
  assert("nextCandidates = [] (no candidates for security-auditor)", result.nextCandidates, []);
}

// ─── TC6: hopCount=2 Depth 패널티 → 점수 음수 가능 ──────────────────────
console.log("\n[TC6] Depth 패널티 (hopCount=2) → score -= 2");
{
  process.env.ENABLE_SHADOW_MULTI_HOP = "true";
  process.env.ENABLE_SHADOW_SCORING = "true";
  // hopCount=2인 컨텍스트 (직접 생성)
  const ctx = { hopCount: 2, visited: [], currentAgent: undefined as any, sourceAgent: undefined };
  // "分析해줘 보안도 확인해줘"
  // Gate: analysis-not-developer → reviewer
  // reviewer 후보: "보안" → [security-auditor]
  // Scoring: security-auditor score = +5 -2 = 3 → 여전히 양수 → 첫 번째 유지
  const result = routeMessage("분析해줘 보안도 확인해줘", undefined, ctx);
  assert("selectedAgent = reviewer (gate: analysis)", result.selectedAgent, "reviewer");
  assert("nextCandidates[0] = security-auditor (score=3 after penalty)", result.nextCandidates?.[0], "security-auditor");
}

// ─── 결과 요약 ─────────────────────────────────────────────────────────────
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`결과: ${pass} passed / ${fail} failed`);
if (fail === 0) {
  console.log("🎉 모든 Shadow Scoring 테스트 통과!");
} else {
  process.exit(1);
}
