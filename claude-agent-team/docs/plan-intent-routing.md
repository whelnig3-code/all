# Intent 기반 에이전트 자동 라우팅 계층 설계

> 작성일: 2026-03-01
> 상태: **검토 대기**
> 관련 프로젝트: JM Agent Team 대시보드

---

## 목표

사용자가 `@reviewer`, `@planner` 등 에이전트를 명시적으로 지정하지 않아도, 메시지 내용(Intent)을 분석하여 **가장 적합한 에이전트를 자동 선택**하는 지능형 라우팅 계층을 구축한다.

### 왜 필요한가

현재 `agent-manager.ts`의 `selectAgent()` 함수는 키워드 매칭 기반이지만, 다음과 같은 한계가 있다:

1. **라우팅 과정이 불투명** -- 어떤 키워드가 매칭되어 어떤 에이전트가 선택됐는지 사용자에게 보이지 않음
2. **복합 의도 미처리** -- "보안 검토 후 코드 수정해줘"처럼 2개 이상의 에이전트가 필요한 경우 첫 번째 매칭만 적용
3. **확장성 부족** -- 새 에이전트 추가 시 `selectAgent()` 내부 if-else 체인을 직접 수정해야 함
4. **강제 게이트 부재** -- 분석 요청이 developer로 빠지는 등 의도-에이전트 불일치 방지 메커니즘 없음

---

## 구현 범위

### 포함 (In Scope)

| 단계 | 기능 | 설명 |
|------|------|------|
| 1 | 키워드 기반 라우팅 엔진 리팩터링 | `selectAgent()` 로직을 `agent-router.ts`로 분리, 구조화된 키워드 매핑 |
| 2 | 라우팅 결과 메타데이터 | 어떤 방법(keyword/explicit/llm)으로 어떤 에이전트가 선택됐는지 기록 |
| 3 | 강제 게이트 규칙 | 의도-에이전트 불일치 감지 및 교정 (분석 요청 -> developer 차단 등) |
| 4 | 대시보드 라우팅 표시 | ChatArea 메시지 상단에 라우팅 판별 결과 배지, RightPanel Timeline에 라우팅 이벤트 |
| 5 | LLM 기반 Intent 분류 (옵션) | 환경변수 플래그로 활성화, 키워드 매칭 실패 시 LLM fallback |

### 제외 (Out of Scope)

- 멀티 에이전트 동시 실행 (복합 의도에 대한 순차 파이프라인은 기존 `PIPELINE_NEXT`로 처리)
- 라우팅 규칙 UI 편집기 (설정 파일 수정으로 대체)
- 에이전트 자동 생성/삭제
- 사용자별 라우팅 프로필

---

## 가정 (Assumptions)

1. 사용자가 에이전트 탭을 명시적으로 클릭한 경우, 자동 라우팅을 **override**(무시)한다 -- 기존 동작 유지
2. LLM 분류는 API 모드(`ANTHROPIC_API_KEY` 설정 시)에서만 사용 가능하다 -- SDK 모드에서는 키워드만 사용
3. 라우팅 로그는 인메모리(최근 100건)로 유지하며, 파일 영속 저장은 하지 않는다
4. 기존 `selectAgent()` 의 우선순위 체계(승인 -> Phase -> 기획 -> 전문 -> 버그 -> 문서 -> 신기능 -> developer)는 유지하되, 구조화한다
5. `writer`와 `designer` 에이전트는 키워드 기반으로만 라우팅한다 (LLM 분류 대상에서 제외 -- 토큰 절약)

---

## 기술 스택

| 항목 | 선택 | 이유 |
|------|------|------|
| 라우팅 엔진 | TypeScript 모듈 (`agent-router.ts`) | 기존 코드베이스와 동일 스택, 별도 의존성 불필요 |
| LLM 분류 | Anthropic Messages API (Haiku) | 빠르고 저렴, 단일 분류 작업에 적합 |
| 상태 관리 | 인메모리 배열 + SSE 이벤트 확장 | 기존 아키텍처 패턴 유지 |
| UI | 기존 컴포넌트 스타일(T 토큰) 활용 | 일관된 디자인 시스템 |

---

## 핵심 설계

### 1. 라우팅 결과 타입 (`RoutingResult`)

```typescript
// src/lib/agent-router.ts에서 export
interface RoutingResult {
  // 최종 선택된 에이전트
  selectedAgent: AgentId;

  // 라우팅 방법
  method: "explicit"    // 사용자가 @agent 또는 UI에서 직접 지정
        | "keyword"     // 키워드 매칭
        | "llm"         // LLM Intent 분류
        | "gate"        // 강제 게이트에 의한 교정
        | "default";    // 기본값 (developer)

  // 매칭된 키워드 (keyword 방법일 때)
  matchedKeywords?: string[];

  // LLM 분류 결과 (llm 방법일 때)
  llmIntent?: string;
  llmConfidence?: number; // 0.0 ~ 1.0

  // 게이트 교정 정보 (gate 방법일 때)
  originalAgent?: AgentId;    // 교정 전 에이전트
  gateReason?: string;        // 교정 사유

  // 타임스탬프
  timestamp: number;
}
```

### 2. 키워드 매핑 구조 리팩터링

현재 `selectAgent()`의 if-else 체인을 **선언적 매핑 테이블**로 변환한다.

```typescript
// 우선순위순으로 정렬된 라우팅 규칙 배열
interface RoutingRule {
  id: string;           // 규칙 식별자 (예: "approval", "phase-task")
  priority: number;     // 낮을수록 먼저 평가 (0이 최우선)
  agent: AgentId;       // 매칭 시 선택될 에이전트
  keywords: string[];   // OR 매칭 키워드 목록
  patterns?: RegExp[];  // 정규식 패턴 (선택)
  excludeKeywords?: string[]; // 이 키워드가 있으면 매칭 제외
  description: string;  // 규칙 설명 (디버깅/로그용)
}

const ROUTING_RULES: RoutingRule[] = [
  {
    id: "approval",
    priority: 0,
    agent: "developer",
    keywords: ["승인", "진행", "ㄱㄱ", "ok", "고고", "시작해"],
    description: "승인/구현 시작 신호 -> developer 직행"
  },
  {
    id: "phase-task",
    priority: 1,
    agent: "planner",
    patterns: [/phase\s*\d/i, /페이즈\s*\d/],
    keywords: [],
    description: "Phase N 작업 -> planner"
  },
  {
    id: "planning",
    priority: 2,
    agent: "planner",
    keywords: ["설계해", "기획해", "계획해", "아키텍처", "로드맵", "구조 설계"],
    excludeKeywords: ["구현", "개발해", "만들어", "코딩", "작성해"],
    description: "기획/설계 요청 (구현 키워드 없을 때)"
  },
  // ... 기존 selectAgent()의 모든 규칙을 이 형태로 변환
];
```

### 3. 강제 게이트 규칙

의도와 에이전트 간 불일치를 감지하여 자동 교정한다.

```typescript
interface GateRule {
  id: string;
  // 이 의도(intent 키워드)가 감지됐는데
  intentKeywords: string[];
  // 이 에이전트가 선택됐으면
  blockedAgent: AgentId;
  // 이 에이전트로 교정
  suggestedAgent: AgentId;
  reason: string;
}

const GATE_RULES: GateRule[] = [
  {
    id: "analysis-not-developer",
    intentKeywords: ["분석", "진단", "상태 점검", "취약점 분석"],
    blockedAgent: "developer",
    suggestedAgent: "reviewer",
    reason: "분석/진단 요청은 리뷰어가 적합합니다"
  },
  {
    id: "security-not-developer",
    intentKeywords: ["보안 감사", "OWASP", "인증 검토", "취약점"],
    blockedAgent: "developer",
    suggestedAgent: "security-auditor",
    reason: "보안 관련 분석은 보안 감사자가 적합합니다"
  },
  {
    id: "design-not-developer",
    intentKeywords: ["UI 설계", "레이아웃 설계", "와이어프레임 설계"],
    blockedAgent: "developer",
    suggestedAgent: "designer",
    reason: "디자인 설계는 디자이너가 적합합니다"
  },
];
```

### 4. LLM Intent 분류 (선택적)

키워드 매칭이 "default" (developer fallback)으로 빠질 때만 LLM을 호출한다.

```typescript
// 환경변수: ENABLE_LLM_ROUTING=true 일 때만 활성화
// 사용 모델: claude-haiku (빠르고 저렴)
// 예상 토큰: 입력 ~200 + 출력 ~50 = ~250 토큰/요청

async function classifyIntentWithLLM(message: string): Promise<{
  agent: AgentId;
  intent: string;
  confidence: number;
}> {
  // 시스템 프롬프트 (고정, 짧게)
  const systemPrompt = `사용자 메시지의 의도를 분류하세요.
가능한 분류: developer, reviewer, researcher, planner, security-auditor, designer, writer
JSON으로만 응답: {"agent":"...", "intent":"...", "confidence":0.0~1.0}`;

  // confidence < 0.6 이면 키워드 결과 유지 (fallback)
}
```

### 5. SSE 이벤트 타입 확장

라우팅 결과를 프론트엔드에 전달하기 위해 새로운 SSE 이벤트 타입을 추가한다.

```typescript
// src/types/index.ts의 SSEEvent 유니온에 추가
| {
    type: "routing";
    agent: string;
    method: RoutingResult["method"];
    matchedKeywords?: string[];
    llmConfidence?: number;
    gateReason?: string;
    originalAgent?: string;
  }
```

---

## 파일 변경 목록

### 신규 파일 (1개)

| 파일 | 역할 |
|------|------|
| `src/lib/agent-router.ts` | 라우팅 엔진 (키워드 매핑, 강제 게이트, LLM 분류, 라우팅 로그) |

### 수정 파일 (5개)

| 파일 | 변경 내용 |
|------|-----------|
| `src/lib/agent-manager.ts` | `selectAgent()` 함수를 `agent-router.ts`의 `routeMessage()`로 교체. `processUserMessage()`에서 라우팅 결과를 SSE "routing" 이벤트로 yield |
| `src/types/index.ts` | `SSEEvent` 유니온에 `"routing"` 타입 추가 |
| `src/components/chat/ChatArea.tsx` | SSE "routing" 이벤트 수신 처리: 에이전트 메시지 상단에 라우팅 방법 배지 표시 |
| `src/components/layout/RightPanel.tsx` | Timeline 탭에 라우팅 이벤트 표시 (어떤 메시지가 어떤 에이전트로 라우팅됐는지) |
| `src/config/agents.ts` | 에이전트별 키워드 목록을 `AGENTS_CONFIG`에 `routingKeywords` 필드로 추가 (선택적, 현재는 router에서 관리) |

### 변경하지 않는 파일

| 파일 | 이유 |
|------|------|
| `src/app/api/chat/route.ts` | API 레이어는 변경 없음 -- `processUserMessage()` 제너레이터가 이미 SSE 이벤트를 yield하므로 새 이벤트 타입은 자동 전달 |
| `src/lib/conversation-store.ts` | Message 타입에 라우팅 정보를 저장할 필요 없음 -- 라우팅은 실시간 UI 표시용 |
| `server.ts` | 변경 없음 |

---

## 단계별 구현 순서

### Phase 1: 라우팅 엔진 분리 (핵심)

**예상 소요: 30분**

1. `src/lib/agent-router.ts` 신규 생성
   - `RoutingResult` 타입 정의
   - `RoutingRule` 배열로 기존 `selectAgent()` 로직 이관
   - `routeMessage(message: string, explicitAgent?: AgentId): RoutingResult` 함수 구현
   - 라우팅 로그 배열 (인메모리, 최근 100건)
   - `getRoutingLog(): RoutingResult[]` 조회 함수

2. `src/lib/agent-manager.ts` 수정
   - `selectAgent()` 함수 제거
   - `import { routeMessage } from "./agent-router"` 추가
   - `processUserMessage()`에서 `routeMessage()` 호출 후 결과를 SSE "routing" 이벤트로 yield

3. `src/types/index.ts` 수정
   - `SSEEvent` 유니온에 `"routing"` 타입 추가

### Phase 2: 강제 게이트 (안전장치)

**예상 소요: 15분**

1. `src/lib/agent-router.ts`에 `GateRule` 배열 추가
2. `routeMessage()` 내부에서 키워드 매칭 후 게이트 검증 단계 추가
3. 게이트 발동 시 `method: "gate"`, `originalAgent`, `gateReason` 기록

### Phase 3: 프론트엔드 라우팅 표시 (가시성)

**예상 소요: 30분**

1. `src/components/chat/ChatArea.tsx` 수정
   - SSE "routing" 이벤트 처리: `ChatMessageData`에 `routing?: { method, matchedKeywords, ... }` 필드 추가
   - 에이전트 메시지 헤더 옆에 라우팅 방법 배지 렌더링:
     - `keyword` -> 연보라 배지 "Keyword"
     - `llm` -> 파란 배지 "LLM (92%)"
     - `gate` -> 주황 배지 "Gate: reviewer -> developer 차단"
     - `explicit` -> 회색 배지 "Direct"
     - `default` -> 회색 배지 "Default"

2. `src/components/layout/RightPanel.tsx` 수정
   - Timeline 탭에 라우팅 이벤트 타임라인 노드 추가 (ROUTE 레벨, 보라색 아이콘)

### Phase 4: LLM Intent 분류 (선택적 확장)

**예상 소요: 20분**

1. `src/lib/agent-router.ts`에 `classifyIntentWithLLM()` 함수 추가
2. `.env.local`에 `ENABLE_LLM_ROUTING=false` 기본값 추가
3. `routeMessage()` 에서 키워드 매칭이 "default"이고 LLM 라우팅이 활성화된 경우에만 호출
4. `confidence < 0.6`이면 키워드 결과 유지 (안전한 fallback)

---

## UI 변경 사항

### 1. ChatArea 에이전트 메시지 헤더

현재:
```
[에이전트 아이콘] 에이전트 이름  12:34
```

변경 후:
```
[에이전트 아이콘] 에이전트 이름  12:34  [Keyword: "리뷰", "검토"]
```

- 배지 스타일: 기존 에이전트 필터 탭과 유사한 pill 형태
- 배지 색상: method에 따라 분기
  - explicit: `T.text3` 배경 (눈에 띄지 않게)
  - keyword: 연보라(`rgba(139,92,246,0.15)`)
  - llm: `T.accent` 배경
  - gate: `T.pending` 배경 + `gateReason` 툴팁
  - default: `T.border` 배경
- 배지 클릭 시: 라우팅 상세 정보 토글 (매칭 키워드, 확신도 등)

### 2. RightPanel Timeline 탭

기존 타임라인 이벤트(SUCCESS/ERROR/WARN/CMD)에 **ROUTE** 레벨 추가:

```
[보라 아이콘 ->] "리뷰해줘" -> reviewer (keyword: "리뷰")  12:34
[주황 아이콘 !] Gate: developer -> reviewer (분석 요청)    12:35
```

- ROUTE 레벨 색상: `#8B5CF6` (보라 -- planner 색상과 통일)
- Gate 발동 시: `T.pending` (주황) + 취소선으로 원래 에이전트 표시

### 3. 사용자 에이전트 선택과의 충돌 방지

| 상황 | 동작 |
|------|------|
| 사용자가 에이전트 탭에서 직접 선택 | `method: "explicit"` -- 자동 라우팅 완전 무시 |
| 자동 라우팅 결과 표시 중 사용자가 다른 에이전트 클릭 | 해당 메시지의 라우팅 배지 유지, 새 메시지부터 새 에이전트 적용 |
| 팀 에이전트 모드 (teamAgents 활성화) | 자동 라우팅 비활성화, 팀 워크플로우 순서대로 실행 |

---

## 타입 변경 사항

### `src/types/index.ts`

```typescript
// SSEEvent 유니온에 추가
| {
    type: "routing";
    agent: string;           // 최종 선택된 에이전트
    method: "explicit" | "keyword" | "llm" | "gate" | "default";
    matchedKeywords?: string[];
    llmConfidence?: number;
    gateReason?: string;
    originalAgent?: string;  // gate 교정 전 에이전트
  }
```

### `ChatArea.tsx` 내부 `ChatMessageData` 인터페이스

```typescript
interface ChatMessageData {
  // 기존 필드 유지
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  timestamp: Date;
  agentId?: string;
  isStreaming?: boolean;
  toolUse?: ToolUsage[];
  isPipeline?: boolean;
  pipelineNext?: PipelineNext;

  // 신규 필드
  routing?: {
    method: "explicit" | "keyword" | "llm" | "gate" | "default";
    matchedKeywords?: string[];
    llmConfidence?: number;
    gateReason?: string;
    originalAgent?: string;
  };
}
```

---

## 환경변수 추가

```bash
# .env.local에 추가
ENABLE_LLM_ROUTING=false   # true: 키워드 실패 시 LLM fallback 활성화
```

---

## 리스크

| 위험 요소 | 심각도 | 대응 방안 |
|-----------|--------|-----------|
| 키워드 매칭 정확도 저하 | 중 | 기존 selectAgent() 로직을 1:1로 이관하므로 동작 변경 없음. 리팩터링만 수행 |
| LLM 분류 지연 (API 호출) | 중 | Haiku 모델 사용(~0.5초), 키워드 실패 시에만 호출, 타임아웃 3초 설정 |
| LLM 분류 비용 | 낮 | ~250 토큰/요청, Haiku 기준 $0.000063/요청, 기본 비활성화 |
| 강제 게이트 오탐 | 중 | 게이트 규칙을 보수적으로 설정 (명확한 불일치만 교정), 게이트 발동 시 사용자에게 시각적 알림 |
| ChatArea SSE 이벤트 추가로 인한 UI 깜빡임 | 낮 | "routing" 이벤트는 메시지 생성 전에 수신되므로 기존 메시지 흐름에 영향 없음 |

---

## 팀 구성 제안

| 단계 | 에이전트 | 역할 |
|------|----------|------|
| Phase 1-2 | @developer | `agent-router.ts` 생성 + `agent-manager.ts` 리팩터링 + 타입 수정 |
| Phase 3 | @developer | ChatArea.tsx + RightPanel.tsx UI 수정 |
| Phase 4 | @developer | LLM 분류 함수 구현 |
| 전체 완료 후 | @reviewer | 코드 리뷰: 기존 selectAgent() 동작이 1:1 보존됐는지 검증 |

- **작업 순서**: 순차 (Phase 1 -> 2 -> 3 -> 4)
- **에이전트팀 병렬 사용**: 불필요 -- 단일 developer가 순차 진행하는 것이 코드 일관성 유지에 적합
- **예상 총 소요**: ~95분

---

## 검토 요청 사항

1. **키워드 매핑 테이블 구조**: 현재 `selectAgent()`의 우선순위 체계를 `RoutingRule[]` 배열로 변환하는 접근이 적절한지
2. **강제 게이트 규칙 범위**: 위 3개 규칙 외에 추가로 필요한 게이트가 있는지
3. **LLM 라우팅 활성화 여부**: Phase 4를 이번에 같이 구현할지, 후속 과제로 남길지
4. **라우팅 배지 UI**: 에이전트 메시지 헤더에 배지 표시가 너무 복잡해 보이지 않는지
5. **Phase 진행 승인**: Phase 1부터 순차 진행해도 되는지
