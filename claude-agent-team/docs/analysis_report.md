# 구현 분석 리포트

- 검토일: 2026-03-03
- 검토 범위: 코드 품질 집중 리뷰 (4개 파일)
- 구현율: N/A (기능 완성도 검토가 아닌 코드 품질 검토)

---

## 발견된 이슈 목록

### agent-router.ts

---

**[R-01]** `agent-router.ts:86-113` — **중복 필드 (selectedAgent / targetAgent)**
- 심각도: **보통**
- `RoutingResult` 인터페이스의 `selectedAgent`(88행)와 `targetAgent`(94행)는 주석에 "selectedAgent와 동일"이라고 명시되어 있으며, 코드 전체에서 항상 같은 값으로 설정됨 (예: 589-590행, 609-610행, 663-664행 등 모든 반환 지점).
- 동일한 데이터를 두 이름으로 저장하는 중복 상태. `targetAgent`는 SSE 필드 명세 준수 목적이라고 주석에 있으나, 소비 측(agent-manager.ts)에서 두 필드를 구분하여 사용하는 코드가 없으면 사문화된 중복임.

---

**[R-02]** `agent-router.ts:675-697` + `agent-router.ts:807-848` — **루프 보호 로직 복사-붙여넣기**
- 심각도: **보통**
- `applyDeterministicLayer`(674-697행)와 `applyFallbackLayer`(807-848행) 두 곳에서 동일한 두 가지 보호 규칙이 반복됨:
  1. `visited.includes(선택된_에이전트)` → loop-protect 반환
  2. `currentAgent === "developer" && 선택 === "developer"` → reviewer로 교정
- 반환 객체의 구조까지 거의 동일 (reason 문자열만 미미하게 다름). 헬퍼 함수로 추출 가능한 복사-붙여넣기 변형.

---

**[R-03]** `agent-router.ts:142-154` — **approval 규칙의 중복 조건**
- 심각도: **낮음**
- `ROUTING_RULES[0]` ("approval" 규칙)에서 `startsWith: ["승인", ...]`과 `compoundCondition: (lower) => lower.includes("승인") && ...`가 동시에 존재함.
- `matchRule` 함수(517-556행)는 `startsWith`와 `compoundCondition`을 독립적으로 평가하여 OR로 합산하므로, "승인"으로 시작하는 메시지는 `startsWith`에서 이미 매칭됨. `compoundCondition`의 `lower.includes("승인")` 부분은 `startsWith`와 겹치는 사전 조건임.

---

**[R-04]** `agent-router.ts:743-753` (inferIntent) + `agent-router.ts:241-276` (GATE_RULES) + `agent-router.ts:180-189` (ROUTING_RULES review/security) — **3중 중복 커버리지**
- 심각도: **보통**
- 리뷰/검토 → reviewer, 보안/취약 → security-auditor, 설계 → planner 패턴이 세 곳에서 독립적으로 정의됨:
  1. `ROUTING_RULES` (키워드 기반, Layer 2)
  2. `GATE_RULES` (의도 신호 기반, Layer 1)
  3. `inferIntent` 함수 (정규식 기반, Layer 3 fallback 내)
- 세 레이어가 의도적으로 분리된 설계지만, 동일 패턴을 세 곳에 각각 유지해야 하는 유지보수 부담이 있음. 특히 키워드 목록 변경 시 세 곳을 모두 동기화해야 함.

---

### agent-manager.ts

---

**[R-05]** `agent-manager.ts:18` — **선언되었으나 사용되지 않는 Map**
- 심각도: **낮음**
- `_chainHopCountMap`(18행)은 `Map<string, number>` 타입으로 선언되어 있으며 변수명 앞 `_` 접두사가 "미사용 예정" 관례를 시사함. 코드 전체에서 이 Map에 값을 쓰거나 읽는 코드가 존재하지 않음 (주석에 "CHAIN_SUMMARY에서 읽고 삭제"라고 있으나 해당 로직 미구현).
- 죽은 코드(dead code)로 서버 기동 후 메모리에 상주하나 실제 기능 없음.

---

**[R-06]** `agent-manager.ts:42-61` — **중복 상태 맵 (agentActiveMap / agentStatusMap)**
- 심각도: **보통**
- 동일한 7개 에이전트 키 집합에 대해 두 개의 분리된 맵이 존재함:
  - `agentActiveMap: Record<string, boolean>` (42-50행): 활성화 여부
  - `agentStatusMap: Record<string, AgentStatus>` (53-61행): idle/active/error 상태
- `getAgentStatuses()`(68-74행)에서 두 맵을 조합하여 반환하며, `cancelCurrentAgent()`(173-182행)에서는 `agentStatusMap`만 순회하고 `agentActiveMap`은 건드리지 않음. "비활성화된 에이전트가 실수로 active 상태로 남는" 경우의 일관성 문제 가능성 있음. 두 맵을 `{ active: boolean; status: AgentStatus }` 단일 레코드로 통합 가능.

---

**[R-07]** `agent-manager.ts:154-158` — **getAgentMaxTokens 내 defaults 객체 매 호출 생성**
- 심각도: **낮음**
- `getAgentMaxTokens` 함수(142-158행) 내에서 `const defaults: Record<string, number> = { developer: 1200, reviewer: 800, ... }`가 함수 호출마다 새로운 객체를 생성함. ENV 값이 없을 때만 도달하는 경로임에도 매번 힙 할당 발생.
- 참고: `getAgentTimeout`(123-137행)의 `envMap`도 동일 패턴이나 이쪽은 각 호출의 입력값(`agentId`)에 따른 슬라이스이므로 성격이 다름.

---

**[R-08]** `agent-manager.ts:595-606` — **avgTokensPerAgent / avgLatencyPerAgent 중복 정의**
- 심각도: **보통**
- `processUserMessage` 함수 내부(595-606행)에 `avgTokensPerAgent`와 `avgLatencyPerAgent` 두 Record가 인라인 객체 리터럴로 정의되어 있음. 동시에 `agent-router.ts`의 `AGENT_COST_PROFILES`(1015-1023행)에도 동일한 7개 에이전트의 avgLatencyMs/avgTokenCost가 정의되어 있음.
- 두 파일에 에이전트별 비용/레이턴시 추정값이 분리 관리되고 있어, 실측값 갱신 시 두 곳을 동기화해야 하는 부담 존재. 누락 시 router의 비용 시뮬레이션과 manager의 COST_ESTIMATE 로그가 불일치하게 됨.

---

### src/app/api/chat/route.ts

---

**[R-09]** `route.ts:34` — **완전히 빈 catch 블록**
- 심각도: **보통**
- `saveImageAttachments` 함수(10-39행)의 `for...of` 루프 내 `catch {}` 블록(34행)이 완전히 비어 있음. 이미지 저장 실패 시 오류가 완전히 무시됨.
- 현재는 주석("저장 실패 시 건너뜀")으로 의도가 표현되어 있으나, 저장 실패한 파일명 목록을 로깅하거나 호출자에게 부분 실패를 전달하는 메커니즘이 없어 디버깅이 어려움.

---

**[R-10]** `route.ts:21-37` — **순차 처리 가능한 병렬화 미적용**
- 심각도: **낮음**
- `for...of` 루프와 `await fsp.writeFile`(32행)의 조합으로 이미지 파일을 순차 저장하고 있음. 첨부 파일이 여러 개일 경우 병렬 처리(`Promise.all`)로 대기 시간 단축 가능.
- 단, 현재 사용 패턴(대부분 0-1개 이미지)을 고려하면 실질적 영향은 적음.

---

### src/lib/claude-code-sdk.ts

---

**[R-11]** `claude-code-sdk.ts:320-327` — **파라미터 sprawl (6개 콜백 파라미터)**
- 심각도: **보통**
- `handleEvent` 함수(320-399행)가 6개의 파라미터를 받음: `event`, `onStream`, `accumulate`, `accumulateStream`, `setToolName`, `getToolName`.
- 특히 `setToolName`(setter)과 `getToolName`(getter)은 외부에서 선언된 클로저 변수(`currentToolName`)의 게터/세터 쌍으로, 이를 분리하여 함수에 전달하는 것은 누수된 추상화임. `handleEvent`가 상태(`currentToolName`)를 직접 소유하거나, 또는 상태 컨테이너 객체를 단일 파라미터로 전달하는 방식이 더 응집도가 높음.
- 또한 `accumulateStream`과 `accumulate`는 각각 다른 버퍼에 누적하는 동일 패턴의 콜백으로, 호출부(242-249행, 271-278행)에서 두 번 인라인 클로저를 작성해야 함.

---

**[R-12]** `claude-code-sdk.ts:435-438` — **타임아웃 후 이중 resolve 가능성**
- 심각도: **낮음**
- `checkSDKAvailable` 함수(404-440행)의 `setTimeout` 콜백(435-438행)에서 `proc.kill()` 후 `resolve({ installed: false, loggedIn: false })`를 호출함. 만약 `proc.kill()` 직후 `proc.on("close", ...)` 이벤트(424-432행)가 즉시 발화하면 `resolve`가 두 번 호출될 수 있음.
- JavaScript의 Promise는 첫 번째 resolve/reject 이후 무시되므로 실제 오동작은 없으나, `settled` 플래그 없이 이중 resolve 경로가 열려 있어 코드 의도가 불명확함. `executeViaSDK`의 `done()` 패턴(171-191행)처럼 `settled` 가드를 사용하는 것이 일관됨.

---

## 총평

4개 파일에서 총 12개 이슈 발견. 심각도 높음 없음, 보통 7건, 낮음 5건.

가장 우선 개선이 필요한 항목:
1. **[R-01]** `selectedAgent` / `targetAgent` 중복 필드 — 타입 레벨 혼란 유발
2. **[R-06]** `agentActiveMap` / `agentStatusMap` 분리 — 상태 불일치 버그 가능성
3. **[R-08]** 에이전트 비용 프로필 이중 정의 — 실측 갱신 시 동기화 실수 위험
4. **[R-11]** `handleEvent` 파라미터 sprawl — 함수 시그니처 복잡도가 유지보수 부담
