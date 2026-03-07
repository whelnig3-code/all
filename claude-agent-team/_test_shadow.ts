
import { routeMessage, createRoutingContext } from "./src/lib/agent-router.ts";

// Shadow 모드 강제 활성화 (env var 설정)
process.env.ENABLE_SHADOW_MULTI_HOP = "true";

const cases = [
  {
    name: "TC1: 코드 리뷰하고 보안도 확인해줘 → reviewer + nextCandidates=[security-auditor]",
    message: "코드 리뷰하고 보안도 확인해줘",
    context: { hopCount: 0, visited: [] },
    expect: { method: "keyword", agent: "reviewer", nextCandidates: ["security-auditor"] },
  },
  {
    name: "TC2: 일반 개발 작업 → developer + nextCandidates=[]",
    message: "일반 개발 작업",
    context: { hopCount: 0, visited: [] },
    expect: { method: "fallback", agent: "developer", nextCandidates: [] },
  },
  {
    name: "TC3: 보안 취약점 분析 → security-auditor (gate) + nextCandidates=[]",
    message: "보안 취약점 분析",
    context: { hopCount: 0, visited: [] },
    expect: { method: "gate", agent: "security-auditor", nextCandidates: [] },
  },
  {
    name: "TC4: reviewer + security-auditor visited → nextCandidates에서 제거",
    message: "코드 리뷰하고 보안도 확인해줘",
    context: { hopCount: 1, visited: ["developer", "reviewer", "security-auditor"], currentAgent: "reviewer" },
    expect: { method: "loop-protect", nextCandidates: [] },
  },
];

// 검증: nextCandidates 배열 비교
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

let pass = 0;
let fail = 0;

for (const tc of cases) {
  const result = routeMessage(tc.message, undefined, tc.context);
  
  const agentOk = tc.expect.agent ? result.selectedAgent === tc.expect.agent : true;
  const methodOk = result.method === tc.expect.method;
  const candidatesOk = arraysEqual(result.nextCandidates ?? [], tc.expect.nextCandidates);
  const ok = agentOk && methodOk && candidatesOk;

  const icon = ok ? "✅" : "❌";
  console.log(`${icon} ${tc.name}`);
  console.log(`   method=${result.method} agent=${result.selectedAgent}`);
  console.log(`   nextCandidates=[${(result.nextCandidates ?? []).join(", ")}]`);

  if (!agentOk)      console.log(`   ⚠ agent: expect=${tc.expect.agent} got=${result.selectedAgent}`);
  if (!methodOk)     console.log(`   ⚠ method: expect=${tc.expect.method} got=${result.method}`);
  if (!candidatesOk) console.log(`   ⚠ candidates: expect=[${tc.expect.nextCandidates.join(",")}] got=[${(result.nextCandidates??[]).join(",")}]`);

  ok ? pass++ : fail++;
  console.log("");
}

// 기존 라우팅 결과 보존 확인 (Shadow OFF 시 nextCandidates 없음)
process.env.ENABLE_SHADOW_MULTI_HOP = "false";
const offResult = routeMessage("리뷰해줘", undefined, { hopCount: 0, visited: [] });
const shadowOff = offResult.nextCandidates === undefined;
console.log(`${shadowOff ? "✅" : "❌"} Shadow OFF 시 nextCandidates 필드 없음: ${shadowOff}`);
if (shadowOff) pass++; else fail++;
console.log("");

console.log(`=== 결과: ${pass}/${cases.length + 1} 통과 ===`);
if (fail > 0) process.exit(1);
