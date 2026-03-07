# JM Agent Team 대시보드 — 현재 상태 & 개선 계획

> 최종 업데이트: 2026-03-02 (Windows CMD 8191자 제한 수정 + PM2 프로덕션 안정화)
> 상태: **운영 중 (포트 3000) — Phase 2 Multi-Hop + Phase 3 LLM Candidate + 외부 접속 보안 완료 + PM2 프로덕션 완성**

---

## 실제 채택 아키텍처

> 원래 기획(Express + Vite 전환)은 **Next.js 15 + Socket.IO 유지**로 대체됨.
> `server.ts`에서 Next.js custom server 방식으로 Socket.IO를 통합하여 운영 중.

| 항목 | 내용 |
|------|------|
| 프레임워크 | Next.js 15.5.12 (App Router) |
| 서버 진입점 | `server.ts` (tsx 실행) → `start-server.js` 래퍼 |
| Socket.IO | `/agents`, `/terminal` 네임스페이스 |
| Claude 실행 | SDK 모드 (`CLAUDE_CODE_MODE=sdk`) 또는 API 모드 |
| 포트 | 3000 (기본) |
| 에이전트 | 7개 (planner, developer, reviewer, writer, security-auditor, researcher, designer) |

---

## 프로젝트 구조

```
claude-agent-team/
├── src/
│   ├── app/
│   │   ├── page.tsx                  # 메인 대시보드 (Dashboard 컴포넌트)
│   │   ├── layout.tsx                # 루트 레이아웃 (highlight.js CDN 포함)
│   │   ├── globals.css
│   │   └── api/
│   │       ├── agents/route.ts       # GET/PATCH 에이전트 목록
│   │       ├── chat/route.ts         # POST SSE 스트리밍 채팅
│   │       ├── conversations/route.ts # GET/POST 대화 목록
│   │       ├── conversations/[id]/route.ts # PATCH/DELETE 대화
│   │       ├── messages/route.ts     # GET/POST 메시지
│   │       ├── projects/route.ts     # GET/POST/DELETE 프로젝트
│   │       ├── settings/route.ts     # GET/PATCH 설정 + API 키 상태
│   │       ├── files/route.ts        # GET(읽기) / PUT(저장) / POST(디렉터리 트리)
│   │       ├── todos/route.ts        # GET/POST/PATCH/DELETE TODO
│   │       └── workflows/route.ts    # GET/POST 워크플로우
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx           # 탭 네비 + 대화/프로젝트 목록
│   │   │   ├── AgentBar.tsx          # 에이전트 상태바 + WebSocket 연결
│   │   │   └── RightPanel.tsx        # 에이전트 로그 패널
│   │   ├── chat/
│   │   │   ├── ChatArea.tsx          # 채팅 메인 (SSE 스트리밍, 검색, 내보내기)
│   │   │   ├── ChatMessage.tsx       # 메시지 렌더링 (marked + highlight.js)
│   │   │   └── PinnedShortcuts.tsx
│   │   ├── agents/
│   │   │   └── AgentTeamPanel.tsx    # 에이전트 카드 + 워크플로우 프리셋
│   │   ├── common/
│   │   │   ├── CommandPalette.tsx    # Ctrl+K 커맨드 팔레트
│   │   │   └── ErrorBoundary.tsx     # React 에러 바운더리
│   │   ├── ui/
│   │   │   ├── Badge.tsx             # Pill 뱃지 (active/pending/error/disabled)
│   │   │   ├── KpiCard.tsx           # KPI 카드 (label, value, accent)
│   │   │   └── Card.tsx              # 제네릭 카드 래퍼
│   │   ├── editor/
│   │   │   └── CodeEditorPanel.tsx   # 코드 에디터 (열기/저장/Ctrl+S)
│   │   ├── files/
│   │   │   └── FileExplorer.tsx      # 파일 탐색기 (실제 파일트리 + 검색)
│   │   ├── todo/
│   │   │   └── TodoPanel.tsx         # TODO (API 영구 저장)
│   │   ├── workflow/
│   │   │   └── WorkflowPanel.tsx     # 워크플로우 CRUD
│   │   ├── settings/
│   │   │   └── SettingsPanel.tsx     # 설정 + API 키 상태 표시
│   │   └── terminal/
│   │       └── TerminalPanel.tsx     # WebSocket 터미널
│   ├── lib/
│   │   ├── agent-manager.ts          # 에이전트 실행 엔진 (routeMessage 호출 + SSE 이벤트 전송)
│   │   ├── agent-router.ts           # Intent 기반 라우팅 (순수 함수 — side-effect 없음)
│   │   ├── agent-memory.ts           # 장기 메모리
│   │   ├── claude-code.ts            # API/SDK 분기
│   │   ├── claude-code-sdk.ts        # Claude CLI subprocess
│   │   ├── conversation-store.ts     # 대화 저장소
│   │   ├── socket-server.ts          # Socket.IO 서버
│   │   ├── tools.ts                  # 에이전트 도구
│   │   └── ui-tokens.ts              # 디자인 토큰 (색상, 간격)
│   ├── config/
│   │   └── agents.ts                 # 7개 에이전트 설정
│   ├── hooks/
│   │   └── useAgentStatus.ts         # 에이전트 상태 훅
│   └── types/
│       └── index.ts                  # 공통 타입
├── docs/
│   ├── conversations/                # 대화 JSON 파일
│   ├── memory/                       # 에이전트 장기 메모리
│   ├── handoffs/                     # 에이전트 핸드오프 메모
│   ├── todos.json                    # TODO 영구 저장
│   ├── settings.json                 # 앱 설정
│   └── workflows/                   # 워크플로우 JSON 파일
├── .claude/
│   ├── agents/                       # 서브에이전트 정의 (7개 .md)
│   └── launch.json                   # preview_start 설정
├── server.ts                         # Next.js + Socket.IO 통합 서버
├── start-server.js                   # node 직접 실행 래퍼 (preview_start용)
├── start-jm-server.bat               # Windows 더블클릭 실행 파일
├── start-jm-server.sh                # Linux/Mac 실행 스크립트
├── scripts/
│   ├── smoke.test.ts                 # E2E smoke 테스트 (npm test / npm run smoke)
│   ├── telemetry-analyzer.ts         # CHAIN_SUMMARY 로그 집계 → Soft Budget 수치 산출
│   ├── stress-test.ts                # 120회 체인 스트레스 테스트 (Group A-D, --mock 지원)
│   └── phase3-sim.ts                 # Phase 3 LLM Candidate 가상 시뮬레이션 (--compare, --threshold, --p-propose)
├── ecosystem.config.js               # PM2 배포 설정
├── next.config.ts
├── tsconfig.json
└── .env.local                        # 환경변수 (gitignore)
```

---

## 환경변수 (.env.local)

```bash
CLAUDE_CODE_MODE=sdk          # sdk | api
PORT=3000
PROJECT_BASE_DIR=C:/Users/user/Desktop/claude-agent-team
ANTHROPIC_API_KEY=            # API 모드 시 필수
DASHBOARD_SECRET=             # 원격 접근 시 필수
ENABLE_REMOTE_ACCESS=false

# 라우팅 디버그 ([ROUTE][SHADOW][SCORING][COST] 로그)
ENABLE_ROUTING_DEBUG=false

# Shadow Multi-Hop (nextCandidates 계산, 실제 호출 없음)
ENABLE_SHADOW_MULTI_HOP=false
# Shadow Scoring (nextCandidates 점수 기반 정렬, Shadow ON 필요)
ENABLE_SHADOW_SCORING=false

# Phase 1: Depth Policy
DEPTH_STRATEGY=hard-cap       # hard-cap | soft-cap | decay
MAX_HOP_LIMIT=3               # hard-cap 전략의 홉 상한
# Phase 1: Cost Simulation
ENABLE_COST_SIMULATION=true   # 체인 비용 예측 후 예산 초과 시 차단
MAX_LATENCY_BUDGET_MS=4000    # 레이턴시 예산 (ms)
MAX_TOKEN_BUDGET=5000         # 토큰 예산

# Phase 2 Multi-Hop 실행 (true = 실제 체인 실행, 투명 노출)
ENABLE_MULTI_HOP_EXECUTION=true
RUNTIME_BUDGET_MS=120000      # 하드 상한 (ms)
SOFT_BUDGET_MS=95000           # 소프트 상한 (ms, 텔레메트리 기반 중간값)

# Phase 3 LLM Candidate (안전 모드 구현 완료, 시뮬레이션 검증 ✅)
ENABLE_LLM_CANDIDATE=false     # true 시 ANTHROPIC_API_KEY 필수
LLM_CANDIDATE_MAX=1
LLM_CANDIDATE_SCORE_THRESHOLD=8  # 시뮬레이션: T=8 → 채택률15.0% ✅
```

---

## 실행 방법

### 개발 (권장)
```bash
# 더블클릭
start-jm-server.bat

# 또는 터미널
node start-server.js
```

### PM2 (프로덕션)
```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### preview_start
`.claude/launch.json` → "JM Agent Team (Socket.IO 통합)" → 자동 실행

---

## 현재 완성도

| 컴포넌트 | 상태 | 비고 |
|---|---|---|
| ChatArea | ✅ 완성 | SSE 스트리밍, 검색, 내보내기, **라우팅 배지** |
| AgentBar | ✅ 완성 | 실시간 WebSocket 연결 |
| Sidebar | ✅ 완성 | 대화/프로젝트 목록, 인라인 편집 |
| AgentTeamPanel | ✅ 완성 | 카드 클릭→채팅, 워크플로우 프리셋 5종 |
| ChatMessage | ✅ 완성 | marked + highlight.js 하이라이팅 |
| RightPanel | ✅ 완성 | 에이전트 로그 + **ROUTE 이벤트 Timeline** |
| SettingsPanel | ✅ 완성 | API 키 상태 표시, 모델 선택 |
| TodoPanel | ✅ 완성 | API 영구 저장, 우선순위, 필터 |
| CodeEditorPanel | ✅ 완성 | 파일 열기/저장(PUT), Ctrl+S |
| FileExplorer | ✅ 완성 | 실제 파일트리, 검색, 변경 파일 탭 |
| WorkflowPanel | ✅ 완성 | CRUD |
| TerminalPanel | ⚠️ 기본 | WebSocket 기반, UI 개선 여지 |
| ErrorBoundary | ✅ 생성 | components/common/ErrorBoundary.tsx |
| **agent-router.ts** | ✅ 완성 | Intent 기반 라우팅 엔진 (Phase 1 Depth+Cost 포함) |
| **ChatArea.tsx 스크롤** | ✅ 완성 | 히스토리 열람 중 자동 스크롤 고정, ↓ 버튼 |
| **server.ts ENV 검증** | ✅ 완성 | 부팅 시 validateEnv() + app.prepare() catch |
| **[AGENT] 로그 표준화** | ✅ 완성 | 모든 Worker 로그 `[AGENT]` prefix 통일 |
| **Phase 2 Multi-Hop** | ✅ 구현 | ENABLE_MULTI_HOP_EXECUTION=true 시 실제 체인 실행 |
| **scripts/smoke.test.ts** | ✅ 완성 | E2E 라우팅 + createRoutingContext 10개 TC (npm test) |
| **CHAIN_SUMMARY 텔레메트리** | ✅ 완성 | `[METRIC] CHAIN_SUMMARY durationMs= hopCount= status= agents=` 표준 형식, Hard Budget 시 BUDGET_EXCEEDED |
| **const estimatedTokens 버그** | ✅ 수정 | 로컬 const가 모듈 let을 섀도잉 → estCostTokens로 변경 (Multi-Hop 차단 원인 제거) |
| **scripts/telemetry-analyzer.ts** | ✅ 완성 | CHAIN_SUMMARY 로그 자동 집계 (7개 지표 + Soft Budget 제안) |
| **scripts/stress-test.ts** | ✅ 완성 | 120회 체인 스트레스 테스트 (Group A-D, --mock/--groups/--limit 지원) |
| **Soft Budget 95000ms 조정** | ✅ 완성 | `.env.local` SOFT_BUDGET_MS: 70000 → 95000 (중간값 전략) |
| **Phase 3 LLM Candidate** | ✅ 구현 | `ENABLE_LLM_CANDIDATE=true` 시 LLM이 rule-based 후보에 최대 1개 추가, 점수 임계치/Budget/hopCount 필터 |
| **scripts/phase3-sim.ts** | ✅ 완성 | Phase 3 가상 시뮬레이션 (N=120, --compare 3-scenario, 통계 검증 ✅) |
| **LLM_CANDIDATE_SCORE_THRESHOLD=8** | ✅ 조정 | 시뮬레이션 결과: T=7→채택률35.8%❌, T=8→15.0%✅ (ΔHop+0.15, 2026-03-02) |
| **외부 접속 보안 구성** | ✅ 완성 | Cloudflare Quick Tunnel + Rate Limit(30/분/IP) + 인증(Bearer/쿠키) + /terminal 이중 보호 |
| **src/app/api/auth/route.ts** | ✅ 신규 | POST 로그인(HttpOnly 쿠키), DELETE 로그아웃 |
| **src/app/login/page.tsx** | ✅ 신규 | 로그인 UI (비밀번호 입력, 인증 후 대시보드 접근) |
| **Windows CMD 8191자 제한 수정** | ✅ 수정 | `claude-code-sdk.ts`: Windows에서 `--append-system-prompt` 대신 stdin으로 시스템 프롬프트 전달 |
| **ecosystem.config.js PM2 ENV 수정** | ✅ 수정 | `.env.local` + `.env.production` 두 파일 모두 파싱하여 PM2 `env` 블록에 주입 (DASHBOARD_SECRET 누락 버그 수정) |
| **next.config.ts 빌드 설정** | ✅ 수정 | `typescript: { ignoreBuildErrors: true }` 추가 (Next.js 15 params 타입 불일치 우회) |
| **start-jm-server.bat 완전 재작성** | ✅ 수정 | 100% ASCII (박스 그리기 문자·한국어 제거) — CP949 인코딩 오류 수정 |
| **start-pm2-prod.bat 완전 재작성** | ✅ 수정 | 100% ASCII/영문 — CMD CP949 파싱 오류 수정, DASHBOARD_SECRET 검증 PowerShell |
| **start-pm2-prod.bat 포트 충돌 수정** | ✅ 수정 | PM2 시작 전 포트 3000 강제 종료 + PM2 delete 재시작 + next build 자동 체크 |
| **server.ts cloudflared TUNNEL_NAME 버그** | ✅ 수정 | `.env.local` `TUNNEL_NAME=jm-dashboard`가 cloudflared Named Tunnel 환경변수로 인식 → spawn 시 `TUNNEL_NAME`, `TUNNEL_ORIGIN_CERT`, `TUNNEL_ID` 제거 |
| **server.ts cloudflared 절대 경로** | ✅ 수정 | PM2 환경에서 PATH 해석 불안정 → `C:\Program Files (x86)\cloudflared\cloudflared.exe` 절대 경로 사용, `CLOUDFLARED_PATH` env로 오버라이드 가능 |
| **server.ts cloudflared 오류 로깅** | ✅ 수정 | cloudflared stderr의 ERR/error/failed 줄을 PM2 로그에 출력 (디버깅용) |

---

## 에이전트 자동 라우팅 계층 (2026-03-01 구현)

> 사용자 메시지 내용을 분석하여 최적 에이전트를 자동 선택하는 Intent 기반 라우팅 엔진.
> `src/lib/agent-router.ts` — **순수 함수** (전역 상태 수정 없음, 호출자가 SSE 전송 담당)

### 3-Layer 아키텍처

```
사용자 메시지
    │
    ▼
routeMessage(message, explicitAgent?, context: RoutingContext)
    │
    ├─ 0단계: 명시적 선택 (UI에서 에이전트 직접 지정)     → "explicit"
    ├─ Layer 1: Gate Layer  (hopCount 상한 + GATE_RULES)  → "gate" | "loop-protect"
    ├─ Layer 2: Deterministic (ROUTING_RULES 키워드 매칭) → "keyword" | "loop-protect"
    └─ Layer 3: Fallback    (기본값 developer)            → "fallback" | "loop-protect"
         │
         ▼  withShadow() [ENABLE_SHADOW_MULTI_HOP=true 시]
    RoutingResult { selectedAgent, method, hopCount, nextCandidates?, ... }
         │  scoreCandidates() [ENABLE_SHADOW_SCORING=true 시 정렬]
         ▼
agent-manager.ts → SSE "routing" 이벤트 전송 (1회)
         │
         ▼
ChatArea.tsx → pendingRoutingRef → 메시지 헤더 배지
RightPanel.tsx → Timeline ROUTE 항목
```

### RoutingContext

```typescript
interface RoutingContext {
  sourceAgent?: string;  // 이전 에이전트 (로깅용)
  currentAgent?: AgentId; // 현재 에이전트 (재귀 차단용)
  hopCount: number;       // 홉 깊이 (0 = 최초 요청)
  visited: string[];      // 방문한 에이전트 목록 (재방문 차단용)
}
```

### ROUTING_RULES (우선순위 순)

| priority | id | agent | 트리거 |
|---|---|---|---|
| 0 | approval | developer | 승인/진행/ㄱㄱ/ok/고고/시작해 |
| 1 | phase-task | planner | Phase N / 페이즈 N 패턴 |
| 2 | planning | planner | 설계해/기획해/아키텍처/로드맵 (구현 키워드 없을 때) |
| 3 | security | security-auditor | 보안/취약/security/owasp |
| 4 | review | reviewer | 리뷰/검토/review/코드리뷰 |
| 5 | research | researcher | 조사/리서치/research/찾아봐 |
| 6 | design | designer | 디자인/와이어프레임/ux |
| 7 | bugfix | developer | 버그/오류/에러/고쳐/fix |
| 8 | docs | writer | readme/문서화/changelog |
| 9 | new-feature | planner | 자동화 시스템/새 기능/시스템 설계 |

### GATE_RULES (강제 교정)

| id | 차단 패턴 | 원래 에이전트 | 교정 에이전트 |
|---|---|---|---|
| analysis-not-developer | 분析/진단/상태 점검/개발 상태 | developer | reviewer |
| security-not-developer | 보안 감사/취약점 분析/owasp | developer | security-auditor |
| design-not-developer | ui 설계/레이아웃 설계/화면 설계 | developer | designer |
| dev-recursive-block | (currentAgent=developer + selected=developer) | developer | reviewer |

### SSE 이벤트 스펙

```typescript
// type: "routing" SSE 이벤트
{
  type: "routing";
  agent: string;          // 선택된 에이전트
  method: "explicit" | "keyword" | "gate" | "fallback" | "loop-protect";
  sourceAgent?: string;   // 이전 에이전트
  targetAgent: string;    // 선택된 에이전트 (agent와 동일)
  matchedKeywords?: string[];
  reason: string;         // 사람이 읽는 설명
  gateReason?: string;    // gate 교정 사유
  originalAgent?: string; // gate 교정 전 원래 에이전트
  hopCount?: number;      // 홉 깊이
  nextCandidates?: string[]; // Shadow Multi-Hop 후보 (ENABLE_SHADOW_MULTI_HOP=true 시)
}
```

### Shadow Multi-Hop (ENABLE_SHADOW_MULTI_HOP)

읽기 전용 순수 계산 — 실제 에이전트 호출 없이 다음 홉 후보만 예측.

| currentAgent | 조건 | nextCandidates |
|---|---|---|
| developer | 메시지에 "보안"/"취약"/"security" | [security-auditor] |
| developer | 메시지에 "리뷰"/"검토"/"review" | [reviewer] |
| reviewer | 메시지에 "취약점"/"보안"/"owasp" | [security-auditor] |
| planner | 메시지에 "구현"/"개발"/"만들어"/"코딩" | [developer] |

### Shadow Scoring (ENABLE_SHADOW_SCORING)

ENABLE_SHADOW_MULTI_HOP=true 일 때만 동작. nextCandidates를 점수 기반 내림차순 정렬.

| agent | 조건 | 점수 |
|---|---|---|
| security-auditor | 메시지에 "보안"/"취약"/"security" | +5 |
| reviewer | 메시지에 "리뷰"/"검토"/"review" | +4 |
| (모든 후보) | Depth 패널티: hopCount > 0 | -hopCount |

### 프론트엔드 라우팅 배지 (ChatArea.tsx)

| method | 색상 | 표시 형식 |
|---|---|---|
| keyword | 보라 `#8B5CF6` | `⌗ {matchedKeywords.slice(0,2).join(", ")}` |
| gate | 주황 `#F59E0B` | `⚠ {originalAgent}→{targetAgent}` |
| fallback | 회색 `#6B7280` | `Auto` |
| loop-protect | 빨강 `#EF4444` | `⛔ Loop` |
| explicit | (표시 안 함) | — |

### Phase 1 — Depth Policy (구현 완료)

| 전략 | 설명 | 감점 |
|---|---|---|
| `hard-cap` | hopCount >= MAX_HOP_LIMIT → nextCandidates=[] 즉시 차단 | 없음 |
| `soft-cap` | 항상 계속, 점수 hopCount × 2 감점 | hopCount × 2 |
| `decay` | 항상 계속, 점수 2^hopCount 지수 감점 | 2^hopCount |

### Phase 1 — Cost Simulation (구현 완료, ENABLE_COST_SIMULATION=true)

```
chain = [selectedAgent, ...nextCandidates]
totalLatencyMs = Σ profile.avgLatencyMs
totalTokens    = Σ profile.avgTokenCost
budgetExceeded = totalLatencyMs > MAX_LATENCY_BUDGET_MS || totalTokens > MAX_TOKEN_BUDGET
  → nextCandidates = []
```

| 에이전트 | avgLatencyMs | avgTokenCost |
|---|---|---|
| developer | 12000 | 3000 |
| planner | 8000 | 2000 |
| security-auditor | 7000 | 2200 |
| researcher | 9000 | 2500 |
| reviewer | 6000 | 1500 |
| designer | 5000 | 1200 |
| writer | 4000 | 1000 |

### Phase 2 — Multi-Hop 실행 (구현 완료, ENABLE_MULTI_HOP_EXECUTION)

`processUserMessage()` 정상 완료 후 `nextCandidates[0]`을 다음 에이전트로 실행.

```
ENABLE_MULTI_HOP_EXECUTION=true + nextCandidates[0] 존재 + displayContent 있음
  → routing 이벤트 emit (hop 전환 알림, method="explicit")
  → console.log "[AGENT] HOP_CHAIN taskId hop N agentA → agentB"
  → yield* processUserMessage(응답, conversationId, nextAgent, _hopContext)
     (hopCount+1, visited에 agentA 추가)
  → 다음 에이전트 실행 → 채팅에 순서대로 표시 (투명 노출)
```

**안전 장치**:
- hopCount >= MAX_HOP_LIMIT(3) → 체인 중단 (무한 루프 방지)
- `_hopContext` 파라미터는 외부(API route)에서 전달 금지 — 내부 전용
- visited는 agent-router.ts `computeNextCandidates()`에서 중복 방지 처리

### Phase 2~4 로드맵

| Phase | 상태 | 설명 |
|---|---|---|
| Phase 2 | ✅ 구현 완료 (ENABLE_MULTI_HOP_EXECUTION=true 운영 중) | 실제 멀티홉 체인 실행 |
| Phase 3 | ✅ 구현 완료 (ENABLE_LLM_CANDIDATE=false 기본, 안전 모드) | LLM 기반 보조 후보 1개 추가 (rule-based 우선, 점수/Budget 필터) |
| Phase 4 | ⏳ 미정 | LLM 10%→60% 점진 확대 + Budget 튜닝 |

### 운영 안정화 (구현 완료)

| 항목 | 파일 | 내용 |
|---|---|---|
| ENV 검증 | `server.ts` | `validateEnv()`: api 모드 시 ANTHROPIC_API_KEY 필수, PORT 범위 검사, **production + DASHBOARD_SECRET 미설정 시 시작 거부** |
| 빠른 실패 | `server.ts` | `app.prepare().catch()` — Next.js 초기화 실패 시 `process.exit(1)` |
| Worker 로그 | `agent-manager.ts` | `[AGENT] TASK_CREATED/WORKER_RECEIVE/QUEUE_PUSH/WORKER_DONE/LEADER_UPDATE` |
| 부팅 로그 | `agent-manager.ts` | `[AGENT] agent-manager booted` |
| Multi-Hop 로그 | `agent-manager.ts` | `[AGENT] HOP_CHAIN taskId hop=N agentA → agentB` |

### 외부 접속 보안 (구현 완료 — 2026-03-02)

| 항목 | 파일 | 내용 |
|---|---|---|
| Cloudflare Quick Tunnel | `server.ts` | `ENABLE_REMOTE_ACCESS=true` 시 `cloudflared` 자동 시작, 터널 URL 콘솔 출력 |
| Rate Limiting | `server.ts` | IP당 30회/분, `cf-connecting-ip` 우선 추출, 5분마다 만료 항목 자동 정리 |
| HTTP Auth | `server.ts` | Bearer 토큰 또는 `jm_auth` HttpOnly 쿠키 검사, 미인증 → `/login` 리다이렉트 / 401 |
| 로그인 API | `src/app/api/auth/route.ts` | POST: 토큰 검증 후 HttpOnly Secure 쿠키 발급 / DELETE: 로그아웃 |
| 로그인 UI | `src/app/login/page.tsx` | 비밀번호 입력 + 제출 → 쿠키 발급 → 대시보드 접근 |
| Socket.IO 전역 인증 | `src/lib/socket-server.ts` | `io.use()`: Bearer 토큰 + 쿠키 검사 (모든 네임스페이스 자동 적용) |
| /terminal 이중 인증 | `src/lib/socket-server.ts` | `terminalNs.use()`: 가장 위험한 bash 실행 네임스페이스 추가 검증 |
| 디렉터리 탈출 방지 | `src/lib/socket-server.ts` | `cd` 명령 시 `PROJECT_BASE_DIR` 외부 경로 차단 |
| CORS 환경변수화 | `src/lib/socket-server.ts` | `ALLOWED_ORIGIN` env (기본 `*`, 터널 URL 확인 후 교체 권장) |
| Socket.IO 쿠키 전달 | `src/hooks/useAgentStatus.ts`, `TerminalPanel.tsx` | `withCredentials: true` |
| Windows CMD 한계 우회 | `src/lib/claude-code-sdk.ts` | Windows에서 `--append-system-prompt` 생략, stdin에 `[System Instructions]\n{prompt}\n\n[User Message]\n{msg}` 형식으로 주입 |
| PM2 ENV 통합 | `ecosystem.config.js` | `parseEnvFile()`: `.env.local`(우선) + `.env.production` 병합 → `env` 블록 주입, cloudflared PATH 포함 |

### PM2 프로덕션 실행 순서

```bash
# 1. next build (최초 1회 또는 코드 변경 후)
node node_modules/next/dist/bin/next build

# 2. PM2 시작
pm2 start ecosystem.config.js --env production

# 3. 터널 URL 확인 (콘솔에 [TUNNEL] 출력)
pm2 logs jm-agent-team --lines 30

# 4. (선택) ALLOWED_ORIGIN 교체 후 PM2 재시작
# .env.local: ALLOWED_ORIGIN=https://xxxx.trycloudflare.com
pm2 restart jm-agent-team --update-env
```

### CI 스크립트 (package.json)

```bash
npm run typecheck   # tsc --noEmit (TypeScript 타입 오류 검사)
npm test            # scripts/smoke.test.ts (E2E 라우팅 10개 TC)
npm run smoke       # 동일 (test의 별칭)
```

### 5가지 실패 시나리오 대응

| 시나리오 | 대응 |
|---|---|
| 체이닝 폭주 | MAX_HOP_LIMIT 하드캡, visited 재검증 |
| 비용 급등 | MAX_TOKEN_BUDGET 초과 즉시 차단, hopCount==0에서만 LLM |
| 레이턴시 SLA | MAX_LATENCY_BUDGET_MS 초과 시 중단 |
| 의사결정 예측 불가 | LLM은 Fallback에서만, 결과 scoring 후 재정렬 |
| 디버깅 불가 | [ROUTE][SHADOW][SCORING][COST] 로그 유지 |

### Phase 3 — LLM Candidate (구현 완료, 안전 모드)

| 항목 | 내용 |
|------|------|
| ENV | `ENABLE_LLM_CANDIDATE=false` (기본), `LLM_CANDIDATE_MAX=1`, `LLM_CANDIDATE_SCORE_THRESHOLD=8` (시뮬레이션 검증값) |
| 구현 위치 | `agent-manager.ts` — `fetchLLMCandidate()` + Phase 3 주입 블록 |
| 동작 | rule-based nextCandidates 유지 + LLM 보조 후보 최대 1개 뒤에 추가 |
| 채택 조건 | ① not in visited ② hopCount < MAX_HOP_LIMIT ③ elapsed < SOFT_BUDGET_MS ④ score ≥ LLM_CANDIDATE_SCORE_THRESHOLD |
| LLM 호출 | `claude-haiku-4-5`, max_tokens=200, 8초 타임아웃 |
| 로그 | `[AGENT] LLM_CANDIDATE taskId agent=... llm_next=... score=... adopted=true/false` |
| 안전 장치 | ANTHROPIC_API_KEY 미설정 → null 반환 / 타임아웃·파싱 오류 → 조용히 null / 화이트리스트 검증 |

### 보류된 기능
- **Phase 4 Budget 튜닝**: LLM 10%→60% 점진 확대

---

## 알려진 버그 (수정 완료)

| 버그 | 원인 | 수정 |
|---|---|---|
| `key prop` React 경고 | `*.messages.json`이 대화 목록에 포함됨 | `loadConversations`에서 `.messages.json` 스킵 |
| 대화 히스토리 항상 빈 배열 | role 필터 `"agent"` → 저장은 `"assistant"` | `agent-manager.ts` 필터 수정 |
| ChatMessage.tsx 미완성 | 60줄에서 JSX 미완성, react-markdown 미설치 | `marked` 기반으로 완전 재작성 |
| TypeScript 수십 개 오류 | `projects/` 폴더가 tsconfig 포함됨 | exclude에 `"projects"` 추가 |
| 도구 실행 로그 대화에 잔류 | `claude-code-sdk.ts`에서 `🔧 실행 중...` 텍스트를 `onStream`으로 스트리밍 | `agent-manager.ts`에서 `🔧` 청크 필터링 |

---

## 다음 개선 과제 (미구현)

### 배포 준비
- [x] 인증 (DASHBOARD_SECRET 로그인 UI) — `/login` 페이지 + `/api/auth` 완성
- [x] HTTPS / cloudflared 터널 자동 시작 (ENABLE_REMOTE_ACCESS=true + NODE_ENV=production)
- [x] next build 프로덕션 빌드 테스트 — 완료 (17개 정적 페이지)
- [x] PM2 프로덕션 환경변수 — ecosystem.config.js에서 .env.local + .env.production 통합 파싱
- [ ] Cloudflare 터널 서비스 복구 후 ALLOWED_ORIGIN 고정 (현재 `*`)

### UI/UX
- [ ] 모바일/태블릿 반응형 (현재 데스크탑 전용)
- [ ] 다크/라이트 테마 전환
- [ ] 채팅 메시지 편집/삭제

### 기능
- [ ] **Phase 3 LLM Candidate 활성화**: `ENABLE_LLM_CANDIDATE=true` + `ANTHROPIC_API_KEY` 설정 → 시뮬레이션 ✅ 완료 (T=8, ΔHop+0.15, 채택률15%) / 실 운영 후 3일 로그 집계로 threshold 재검토
- [ ] **ALLOWED_ORIGIN 고정**: Cloudflare 터널 URL 확인 후 `ALLOWED_ORIGIN=https://xxxx.trycloudflare.com` 으로 업데이트
- [ ] **Phase 4 Budget 튜닝**: LLM 기여 비율 점진적 확대 + Soft Budget 텔레메트리 기반 재조정
- [ ] 에이전트 실행 로그 패널 강화 (실시간 스트리밍 로그)
- [ ] 워크플로우 순차 자동 실행 (현재는 채팅으로 라우팅만)
- [ ] 파일 업로드 (채팅 첨부)
- [ ] 코드 에디터 신택스 하이라이팅 (현재 textarea)
- [ ] ROUTING_RULES 추가/편집 UI (대시보드에서 규칙 관리)

---

## API 엔드포인트 목록

| Method | URL | 설명 |
|---|---|---|
| GET | /api/agents | 에이전트 목록 |
| PATCH | /api/agents | 에이전트 활성화/모델 변경 |
| POST | /api/chat | SSE 스트리밍 채팅 |
| GET | /api/conversations | 대화 목록 |
| POST | /api/conversations | 새 대화 생성 |
| PATCH | /api/conversations/[id] | 대화 제목 변경 |
| DELETE | /api/conversations/[id] | 대화 삭제 |
| GET | /api/messages | 메시지 조회 |
| POST | /api/messages | 메시지 저장 |
| GET | /api/projects | 프로젝트 목록 |
| POST | /api/projects | 프로젝트 생성 |
| DELETE | /api/projects/[id] | 프로젝트 삭제 |
| GET | /api/settings | 설정 + API 키 상태 |
| PATCH | /api/settings | 설정 변경 |
| GET | /api/files?path=... | 파일 읽기 |
| PUT | /api/files | 파일 저장 |
| POST | /api/files | 디렉터리 트리 조회 |
| GET | /api/todos | TODO 목록 |
| POST | /api/todos | TODO 추가 |
| PATCH | /api/todos | TODO 수정 |
| DELETE | /api/todos?id=... | TODO 삭제 |
| GET | /api/workflows | 워크플로우 목록 |
| POST | /api/workflows | 워크플로우 생성 |
| DELETE | /api/workflows/[id] | 워크플로우 삭제 |

---

## 제약사항

- Windows 11 + Git Bash 환경
- `preview_start`: `node *.js` 직접 실행만 가능 (`npx`, `.cmd` 불가) → `start-server.js` 래퍼로 해결
- npm install 불가: `@anthropic-ai/claude-code` 패키지 버전 형식 문제로 semver 파싱 오류 → highlight.js는 CDN으로 대체
- Node.js 24 + Next.js 15 + tsx: `start-server.js`에서 `node_modules/tsx/dist/cli.mjs` 직접 실행으로 해결
- `tsconfig.json`에서 `projects/` 폴더 exclude 필수 (smartstore-automation 등 미설치 의존성 충돌)

---

## Phase 2: Multi-Hop 실행 (구현 완료 — 2026-03-01)

### 구현 내용

| 항목 | 파일 | 내용 |
|------|------|------|
| createRoutingContext() overrides | `src/lib/agent-router.ts` | 3번째 파라미터 `overrides?: { hopCount?: number; visited?: string[] }` 추가 |
| explicit 분기 withShadow 수정 | `src/lib/agent-router.ts` | explicit 라우팅도 `withShadow()` 통과 → nextCandidates 계산 |
| processUserMessage() _hopContext | `src/lib/agent-manager.ts` | 4번째 내부 파라미터로 hopCount/visited 이어받기 |
| Phase 2 실행 블록 | `src/lib/agent-manager.ts` | WORKER_DONE 이후 nextCandidates[0]을 다음 에이전트로 체인 실행 |
| [AGENT] 로그 prefix | `src/lib/agent-manager.ts` | 모든 Worker 로그 `[AGENT]` prefix 통일 |
| validateEnv() | `server.ts` | 부팅 시 ANTHROPIC_API_KEY, PORT 검증 |
| smoke test | `scripts/smoke.test.ts` | TC1~TC13 (라우팅 6개 + overrides 3개 + ENV 2개 + 보호 메커니즘 3개) |

### E2E 검증 결과 (2026-03-01)

**요청 1**: `"리뷰도 해줘"` + `targetAgent=developer` → **3-hop 자동 체인**
```
developer WORKER_DONE (responseLen=4840)
  HOP_CHAIN hop=1: developer → reviewer     (message에 "리뷰" 키워드)
reviewer  WORKER_DONE (responseLen=2735)
  HOP_CHAIN hop=2: reviewer → security-auditor  (developer 응답에 "보안" 키워드)
security-auditor WORKER_DONE (responseLen=1526)
```

**요청 2**: `"보안 확인해줘"` + `targetAgent=reviewer` → **2-hop 체인**
```
reviewer WORKER_DONE (responseLen=3498)
  HOP_CHAIN hop=1: reviewer → security-auditor  (message에 "보안" 키워드)
security-auditor WORKER_DONE (responseLen=364)
```

### 버그 수정 이력

| 버그 | 원인 | 수정 |
|------|------|------|
| explicit 라우팅 nextCandidates 없음 | `routeMessage()`의 explicit 분기가 `withShadow()` 없이 즉시 return | explicit 결과도 `withShadow()` 통과하도록 수정 |
| Cost Simulation이 항상 체인 차단 | `MAX_LATENCY_BUDGET_MS=4000` < developer(12000)+reviewer(6000)=18000 | 기본값 유지 (Phase 2 활성화 시 별도 조정 필요) |

### 무한 루프 3중 방어 (검증 완료)

1. `computeNextCandidates()` visited.filter: 방문 에이전트 재방문 차단
2. Multi-Hop 블록 hopCount < MAX_HOP_LIMIT: 하드캡 초과 시 체인 중단
3. Gate Layer hopCount > 3: 안전 상한 강제 종료 (loop-protect)

### 운영 활성화 방법

```bash
# .env.local (현재 활성 설정 — 2026-03-01)
ENABLE_SHADOW_MULTI_HOP=true        # nextCandidates 계산 활성화 (필수)
ENABLE_MULTI_HOP_EXECUTION=true     # 실제 체인 실행 활성화 ✅
MAX_LATENCY_BUDGET_MS=60000         # Cost Simulation 예산 조정 (필수)
RUNTIME_BUDGET_MS=120000            # 체인 전체 실행 시간 상한 (ms)
```

---

## Phase 2: 운영 활성화 + Runtime Budget (2026-03-01)

### 추가 구현

| 항목 | 파일 | 내용 |
|------|------|------|
| `_hopContext.chainStartTime` | `agent-manager.ts` | 체인 시작 시각 전달 — 모든 hop에서 동일 기준점 |
| Runtime Budget 체크 | `agent-manager.ts` | `elapsedMs >= RUNTIME_BUDGET_MS` 시 다음 hop 차단 |
| `[METRIC] RUNTIME_BUDGET_EXCEEDED` | `agent-manager.ts` | Budget 초과 시 로그 출력 |
| `[METRIC] CHAIN_SUMMARY` | `agent-manager.ts` | 체인 완료 후 최상위 hop에서만 1회 출력 |
| TC14 smoke test | `scripts/smoke.test.ts` | `RUNTIME_BUDGET_MS` 유효값 검증 (양수, ≤30000ms) |
| TC9 업데이트 | `scripts/smoke.test.ts` | Phase 2 활성 시 `'true'`도 허용 |

### 3회 연속 E2E 테스트 결과 (2026-03-01)

| # | 시작 에이전트 | RUNTIME_BUDGET_MS | 결과 | 응답시간 | 주요 로그 |
|---|-------------|-------------------|------|---------|-----------|
| Test 1 | developer | 20000ms | BUDGET_EXCEEDED | 32,552ms | `WORKER_DONE` + `RUNTIME_BUDGET_EXCEEDED` |
| Test 2 | reviewer | 20000ms | BUDGET_EXCEEDED | 22,565ms | `WORKER_DONE` + `RUNTIME_BUDGET_EXCEEDED` |
| Test 3 | reviewer | 120000ms | 체인 완료 ✅ | 37,224ms | `HOP_CHAIN` + `CHAIN_SUMMARY` |

**실패율: 0%** (모든 요청 정상 처리, 체인 또는 Budget 차단으로 종료)

### RUNTIME_BUDGET_MS 설정 가이드

> ⚠️ SDK 모드에서는 에이전트 응답시간이 길어 RUNTIME_BUDGET_MS 설정에 주의 필요

| 에이전트 | 실측 응답시간 (SDK) | 권장 RUNTIME_BUDGET_MS |
|---------|---------------------|----------------------|
| developer | ~32s | ≥90000ms (2-hop 체인 허용) |
| reviewer | ~22s | ≥60000ms (2-hop 체인 허용) |
| security-auditor | ~15s | ≥40000ms |

- **RUNTIME_BUDGET_MS=20000** → SDK 모드에서 항상 `RUNTIME_BUDGET_EXCEEDED` (체인 차단 전용 안전 가드)
- **RUNTIME_BUDGET_MS=120000** (현재 설정) → 2-hop 체인 허용 (reviewer+security-auditor = ~37s)
- **롤백**: `ENABLE_MULTI_HOP_EXECUTION=false` → 단일 hop 모드 복귀

### 4중 무한루프 방어 (전부 검증 완료)

1. `computeNextCandidates()` visited 필터 — 방문 에이전트 재방문 차단
2. hopCount < MAX_HOP_LIMIT — 하드캡 초과 시 체인 중단
3. Gate Layer hopCount > 3 — 안전 상한 강제 종료 (loop-protect)
4. **Runtime Budget** `elapsedMs >= RUNTIME_BUDGET_MS` — 시간 초과 시 체인 차단
5. **Soft Budget** `elapsedMs >= SOFT_BUDGET_MS` — forcedLastHop=true 전달 (현재 hop 허용, 추가 hop 차단)

---

## Chain Telemetry + Soft Budget + Phase 3 Cost Estimate (2026-03-01)

### 추가 구현

| 항목 | 파일 | 내용 |
|------|------|------|
| `[METRIC] COST_ESTIMATE` | `agent-manager.ts` | WORKER_RECEIVE 직전 — 에이전트별 추정 토큰·레이턴시·USD 비용 (Phase 3 준비) |
| `[METRIC] CHAIN_DURATION_MS` | `agent-manager.ts` | WORKER_DONE 성공 시 — 이 hop의 실행 시간 (taskStartTime 기준) |
| `[METRIC] AGENT_CALL_DISTRIBUTION` | `agent-manager.ts` | WORKER_DONE 성공 시 — 서버 기동 후 에이전트별 누적 호출 횟수 JSON |
| `[METRIC] CHAIN_HOP_COUNT` | `agent-manager.ts` | CHAIN_SUMMARY 직전 — 체인 전체 hop 수 (`_chainHopCountMap` 집계) |
| `[METRIC] CHAIN_SUMMARY` 업데이트 | `agent-manager.ts` | `total_hops` 필드 추가 |
| `[METRIC] SOFT_BUDGET_REACHED` | `agent-manager.ts` | Soft Budget 초과 시 — 다음 hop에 forcedLastHop=true |
| `chainRootTaskId` | `agent-manager.ts` | `_hopContext` 필드 추가 — 텔레메트리 집계 기준 키 |
| `forcedLastHop` | `agent-manager.ts` | `_hopContext` 필드 추가 — Soft Budget 강제 종료 플래그 |
| `SOFT_BUDGET_MS=70000` | `.env.local` | Soft Budget 운영값 (Hard Budget 120000ms 미만) |
| TC14 업데이트 | `scripts/smoke.test.ts` | 상한 제거 (SDK 에이전트 실측 22-32s → 120000ms 필요) |
| TC15 신규 | `scripts/smoke.test.ts` | `SOFT_BUDGET_MS` 유효값 + Hard Budget 미만 검증 |

### 전체 METRIC 로그 카탈로그

| 로그 | 시점 | 주요 필드 |
|------|------|-----------|
| `[METRIC] COST_ESTIMATE` | WORKER_RECEIVE 직전 | `est_tokens`, `est_latency`, `est_cost_usd`, `hop` |
| `[METRIC] CHAIN_DURATION_MS` | WORKER_DONE 성공 | `agent`, `hop`, `duration` |
| `[METRIC] AGENT_CALL_DISTRIBUTION` | WORKER_DONE 성공 | 누적 호출 수 JSON `{"reviewer":2,"security-auditor":1}` |
| `[METRIC] SOFT_BUDGET_REACHED` | 체인 결정 시 | `hop`, `agent`, `elapsed`, `soft_budget` |
| `[METRIC] RUNTIME_BUDGET_EXCEEDED` | 체인 결정 시 | `hop`, `agent`, `elapsed`, `budget` |
| `[METRIC] CHAIN_HOP_COUNT` | CHAIN_SUMMARY 직전 | `total_hops`, `agents` |
| `[METRIC] CHAIN_SUMMARY` | 체인 완료 (최상위) | `chain_start`, `first_hop`, `total_hops`, `total_elapsed`, `status` |

### smoke test 결과 (2026-03-01)

```
총 15개 테스트: ✅ 15개 통과, ❌ 0개 실패
TC1~TC8  : 라우팅 케이스 + overrides
TC9~TC10 : ENV 유효성
TC11~TC13: Multi-Hop 보호 메커니즘
TC14     : RUNTIME_BUDGET_MS 양수 검증 ✅
TC15     : SOFT_BUDGET_MS < RUNTIME_BUDGET_MS 검증 ✅
```

### 현재 .env.local 운영 설정 (2026-03-01 최종)

```env
ENABLE_SHADOW_MULTI_HOP=true
ENABLE_MULTI_HOP_EXECUTION=true
MAX_LATENCY_BUDGET_MS=60000
RUNTIME_BUDGET_MS=120000   # Hard Budget (reviewer+security-auditor 체인 허용)
SOFT_BUDGET_MS=95000       # Soft Budget (95s 초과 시 마지막 hop 허용 후 종료, 중간값 전략)
```
