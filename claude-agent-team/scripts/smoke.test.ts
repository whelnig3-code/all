/**
 * E2E Smoke Test — 라우팅 로직 + createRoutingContext 단위 검증
 *
 * 실행 방법:
 *   npm test
 *   npm run smoke
 *   node node_modules/tsx/dist/cli.mjs scripts/smoke.test.ts
 *
 * CI 환경에서는 종료 코드로 성공/실패 판단:
 *   0 = 전체 통과, 1 = 하나 이상 실패
 */

import { routeMessage, createRoutingContext } from "../src/lib/agent-router";

// ─── 테스트 유틸리티 ──────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;

/** 테스트 케이스 실행 — 실패해도 전체 테스트 계속 */
function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    pass++;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`  ❌ FAIL: ${name} → ${msg}`);
    fail++;
  }
}

/** 단순 동등 비교 */
function expect<T>(actual: T, expected: T, label = ""): void {
  if (actual !== expected) {
    throw new Error(
      `${label ? label + " — " : ""}expected=${String(expected)}, actual=${String(actual)}`
    );
  }
}

// ─── TC1~TC5: 라우팅 키워드 매칭 ────────────────────────────────────────────

console.log("\n📋 라우팅 케이스 테스트");

test("TC1: '기획해줘' → planner", () => {
  // 주의: '기획서'는 planning 키워드가 아님 — '기획해'가 실제 매칭 키워드
  const ctx = createRoutingContext();
  const r = routeMessage("기획해줘", undefined, ctx);
  expect(r.selectedAgent, "planner", "agent");
});

test("TC2: '버그 고쳐줘' → developer", () => {
  const ctx = createRoutingContext();
  const r = routeMessage("버그 고쳐줘", undefined, ctx);
  expect(r.selectedAgent, "developer", "agent");
});

test("TC3: '코드 리뷰해줘' → reviewer", () => {
  const ctx = createRoutingContext();
  const r = routeMessage("코드 리뷰해줘", undefined, ctx);
  expect(r.selectedAgent, "reviewer", "agent");
});

test("TC4: '취약점 찾아줘' → security-auditor", () => {
  // 주의: '보안 점검해줘'는 Gate Layer에서 '점검해' 키워드로 reviewer로 교정됨
  // '취약점'은 게이트 없이 security-auditor로 직접 라우팅됨
  const ctx = createRoutingContext();
  const r = routeMessage("취약점 찾아줘", undefined, ctx);
  expect(r.selectedAgent, "security-auditor", "agent");
});

test("TC5: 'README 작성해줘' → writer", () => {
  const ctx = createRoutingContext();
  const r = routeMessage("README 작성해줘", undefined, ctx);
  expect(r.selectedAgent, "writer", "agent");
});

// ─── TC6: createRoutingContext overrides (Phase 2 Multi-Hop) ────────────────

console.log("\n📋 createRoutingContext overrides 테스트");

test("TC6: overrides.hopCount=2, visited=['planner'] 이어받기", () => {
  const ctx = createRoutingContext(undefined, undefined, {
    hopCount: 2,
    visited: ["planner"],
  });
  if (ctx.hopCount !== 2) {
    throw new Error(`hopCount expected=2, actual=${ctx.hopCount}`);
  }
  if (!ctx.visited.includes("planner")) {
    throw new Error(`visited 'planner' not found in [${ctx.visited.join(", ")}]`);
  }
});

test("TC7: overrides 없으면 hopCount=0, visited=[]", () => {
  const ctx = createRoutingContext();
  if (ctx.hopCount !== 0) {
    throw new Error(`hopCount expected=0, actual=${ctx.hopCount}`);
  }
  if (ctx.visited.length !== 0) {
    throw new Error(`visited expected=[], actual=[${ctx.visited.join(", ")}]`);
  }
});

test("TC8: explicit targetAgent 지정 시 해당 에이전트 선택", () => {
  const ctx = createRoutingContext();
  const r = routeMessage("아무 말이나", "designer", ctx);
  expect(r.selectedAgent, "designer", "agent");
  expect(r.method, "explicit", "method");
});

// ─── TC9~TC10: ENV 설정 테스트 ──────────────────────────────────────────────

console.log("\n📋 ENV 설정 테스트");

test("TC9: ENABLE_MULTI_HOP_EXECUTION 유효값 검증 ('true' | 'false')", () => {
  // Phase 2 운영 활성화(2026-03-01) 이후 'true'/'false' 모두 허용
  // 기본값 미설정 시 'false' (안전 기본값)
  const val = process.env.ENABLE_MULTI_HOP_EXECUTION ?? "false";
  if (val !== "true" && val !== "false") {
    throw new Error(
      `ENABLE_MULTI_HOP_EXECUTION must be 'true' or 'false', got '${val}'`
    );
  }
});

test("TC10: ENABLE_SHADOW_MULTI_HOP 존재 확인", () => {
  // .env.local에 정의된 값 확인 (기본 false)
  const val = process.env.ENABLE_SHADOW_MULTI_HOP ?? "false";
  if (val !== "true" && val !== "false") {
    throw new Error(`ENABLE_SHADOW_MULTI_HOP should be 'true' or 'false', got '${val}'`);
  }
});

// ─── TC11~TC13: Multi-Hop 보호 메커니즘 검증 ─────────────────────────────────
// Point 1/5 대응: 무한 루프 차단 + visited 기반 중복 방지 + MAX_HOP_LIMIT 하드캡 검증

console.log("\n📋 Multi-Hop 보호 메커니즘 테스트");

test("TC11: hopCount > 3 → loop-protect 강제 종료 (Gate Layer 안전 상한)", () => {
  // applyGateLayer: context.hopCount > 3 이면 즉시 loop-protect 반환
  // ENABLE_SHADOW_MULTI_HOP 설정 무관하게 항상 동작
  const ctx = createRoutingContext(undefined, undefined, { hopCount: 4, visited: [] });
  const r = routeMessage("아무 말이나 해줘", undefined, ctx);
  if (r.method !== "loop-protect") {
    throw new Error(
      `hopCount=4 should trigger loop-protect, got method="${r.method}" agent="${r.selectedAgent}"`
    );
  }
});

test("TC12: visited 에이전트는 nextCandidates에서 자동 제외 (computeNextCandidates 필터)", () => {
  // ENABLE_SHADOW_MULTI_HOP=false 이면 nextCandidates 계산 자체를 하지 않음 — 조건부 스킵
  if (process.env.ENABLE_SHADOW_MULTI_HOP !== "true") {
    console.log("    ⏭ SKIP (ENABLE_SHADOW_MULTI_HOP=false — nextCandidates 미계산)");
    return;
  }
  // security-auditor가 이미 visited에 있을 때 → nextCandidates에 포함되면 안 됨
  // developer + "보안"/"취약" 메시지 → computeNextCandidates가 security-auditor 제안
  // 하지만 visited=["security-auditor"] 이므로 필터로 제거되어야 함
  const ctx = createRoutingContext(undefined, undefined, {
    hopCount: 1,
    visited: ["security-auditor"],
  });
  const r = routeMessage("취약점 보안 확인해줘", "developer", ctx);
  const candidates = r.nextCandidates ?? [];
  if (candidates.includes("security-auditor")) {
    throw new Error(
      `security-auditor is in visited but appeared in nextCandidates=[${candidates.join(",")}]`
    );
  }
});

test("TC13: hopCount >= MAX_HOP_LIMIT 도달 시 nextCandidates=[] (hard-cap 전략)", () => {
  // ENABLE_SHADOW_MULTI_HOP=false 이면 nextCandidates 계산 자체를 하지 않음 — 조건부 스킵
  if (process.env.ENABLE_SHADOW_MULTI_HOP !== "true") {
    console.log("    ⏭ SKIP (ENABLE_SHADOW_MULTI_HOP=false — nextCandidates 미계산)");
    return;
  }
  if ((process.env.DEPTH_STRATEGY ?? "hard-cap") !== "hard-cap") {
    console.log(`    ⏭ SKIP (DEPTH_STRATEGY=${process.env.DEPTH_STRATEGY} — hard-cap 아님)`);
    return;
  }
  const maxHop = Number(process.env.MAX_HOP_LIMIT ?? "3");
  // hopCount == maxHop → withShadow()가 즉시 nextCandidates=[] 반환
  const ctx = createRoutingContext(undefined, undefined, { hopCount: maxHop, visited: [] });
  const r = routeMessage("취약점 보안 확인해줘", "developer", ctx);
  if ((r.nextCandidates?.length ?? 0) !== 0) {
    throw new Error(
      `hopCount=${maxHop} >= MAX_HOP_LIMIT=${maxHop} should return nextCandidates=[], got [${r.nextCandidates?.join(",") ?? "undefined"}]`
    );
  }
});

// ─── TC14: Runtime Budget ENV 검증 ───────────────────────────────────────────

console.log("\n📋 Runtime Budget ENV 테스트");

test("TC14: RUNTIME_BUDGET_MS 유효값 검증 (양수 숫자)", () => {
  // 참고: SDK 에이전트 실측 응답시간 developer~32s, reviewer~22s
  //       2-hop 체인 허용 최소값 ≈ 60000ms → 상한 없음 (운영 환경 맞춤 설정)
  const raw = process.env.RUNTIME_BUDGET_MS;
  if (!raw) {
    // 미설정 시 기본값 120000ms 사용 — 유효하므로 통과
    return;
  }
  const val = Number(raw);
  if (isNaN(val) || val <= 0) {
    throw new Error(
      `RUNTIME_BUDGET_MS must be a positive number, got '${raw}'`
    );
  }
});

test("TC15: SOFT_BUDGET_MS 유효값 검증 (0=비활성 또는 양수, RUNTIME_BUDGET_MS 미만)", () => {
  const rawSoft = process.env.SOFT_BUDGET_MS;
  const rawHard = process.env.RUNTIME_BUDGET_MS;
  if (!rawSoft) {
    // 미설정 시 기본값 0 (비활성) — 유효하므로 통과
    return;
  }
  const soft = Number(rawSoft);
  if (isNaN(soft) || soft < 0) {
    throw new Error(
      `SOFT_BUDGET_MS must be 0 (disabled) or positive, got '${rawSoft}'`
    );
  }
  if (soft === 0) return; // 비활성 — 추가 검증 불필요
  if (rawHard) {
    const hard = Number(rawHard);
    if (!isNaN(hard) && soft >= hard) {
      throw new Error(
        `SOFT_BUDGET_MS=${soft}ms must be less than RUNTIME_BUDGET_MS=${hard}ms`
      );
    }
  }
});

// ─── 결과 요약 ────────────────────────────────────────────────────────────────

const total = pass + fail;
console.log(`\n${"─".repeat(50)}`);
console.log(`총 ${total}개 테스트: ✅ ${pass}개 통과, ❌ ${fail}개 실패`);

if (fail > 0) {
  console.error(`\n❌ ${fail}개 테스트 실패 — CI 빌드 차단`);
  process.exit(1);
} else {
  console.log(`\n✅ 모든 테스트 통과`);
  process.exit(0);
}
