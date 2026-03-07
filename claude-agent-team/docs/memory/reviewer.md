# 리뷰어 장기 메모리


## 2026-03-01 03:37

전체 핵심 파일 8개를 분석했습니다. 아래에 심각도별로 정리합니다.

---

## 코드 리뷰 결과

### 🔴 보안 취약점 (Critical)

**1. Path Traversal — `tools.ts:102-125`**
```ts
// 현재 코드
const fullPath = path.isAbsolute(filePath) ? filePath : path.join(base, filePath);
```
절대 경로를 그대로 허용합니다. 에이전트가 `read_file(path="/etc/passwd")` 또는 `read_file(path="C:/Users/user/.ssh/id_rsa")` 를 호출하면 **파일시스템 전체 접근**이 가능합니다. `write_file`, `list_files` 동일.

**2. 명령 인젝션 — `socket-server.ts:75`**
```ts
spawn("bash", ["-c", trimmed], { ... })
```
WebSocket `terminal:command` 이벤트는 **인증 없이** 클라이언트 입력을 bash에 직접 전달합니다. 브라우저 탭이 열려 있는 누구든 서버에서 임의 명령 실행 가능.

**3. conversationId Path Traversal — `conversation-store.ts:22`**
```ts
path.join(getMessagesDir(), `${conversationId}.messages.json`)
```
`conversationId = "../../etc/hosts"` 처럼 조작 시 경로 탈출 가능. API 입력값이므로 검증 필

---

## 2026-03-01 04:18

`@reviewer` 자동 호출 조건에 해당합니다. 보안 점검 결과를 바탕으로 코드 리뷰를 진행합니다.---

## 코드 리뷰 결과 (`@reviewer`)

보안 점검 결과를 기반으로, 실제 코드를 직접 확인하여 리뷰를 작성합니다.

---

### 우선순위 요약

| 등급 | 건수 | 주요 영역 |
|------|------|-----------|
| 🔴 Critical | 2 | 인증 없는 터미널, API 인증 전무 |
| 🟠 High | 3 | 경로 탈출, MIME 미검증, 경쟁 조건 |
| 🟡 Medium | 4 | 동기 I/O 블로킹, API 키 노출, 불필요 재정렬 |
| 🔵 Low | 2 | 코드 구조, 데드코드 |

---

### 🔴 C-1 — 터미널 인증 없음 + CORS `"*"`
**파일**: `src/lib/socket-server.ts:19-24, 40-97`

```ts
// 현재: 누구나 연결 가능
cors: { origin: "*", methods: ["GET", "POST"] }

// 연결 즉시 임의 명령 실행
const proc = spawn("bash", ["-c", trimmed], { ... });
```

**실제 위협 수준**: CVSS 9.8 (네트워크 노출 시 RCE).  
로컬 전용이라도 `CORS *`는 브라우저 XSS 이후 크로스-오리진 소켓 연결로 악용 가능.

**필수 수정 2가지**:
1. CORS `origin`을 환경변수로 제한 (`process.env.ALLOWED_ORIGIN ?? "http://localhost:3000"`)
2. 

---

## 2026-03-01 04:20

핵심 파일들을 분석합니다.엄격한 코드 리뷰어로서 핵심 3개 파일을 분석했습니다.

---

## 코드 분석 결과

### 🔴 Critical (즉시 수정 필요)

#### 1. Path Traversal 위험 — `agent-manager.ts:246`
```typescript
// readHandoffMemo: fromAgentId를 직접 경로에 삽입
const filePath = pathMod.join(base, "docs", "handoffs", `${fromAgentId}.md`);
```
현재는 `HANDOFF_SOURCES` hardcoded 값을 쓰지만, `HANDOFF_SOURCES[agentId]` 체계가 바뀌거나 `agentId` 검증이 빠지면 경로 조작 가능. AgentId 화이트리스트 검증 필요.

#### 2. 이미지 첨부 MIME 타입 검증 없음 — `route.ts:25-33`
```typescript
const match = att.content.match(/^data:([^;]+);base64,(.+)$/);
// mimeType이 "image/*" 인지 확인 안 함!
```
`text/html`, `application/javascript` 등 임의 파일을 서버에 저장 가능. 에이전트 Read 도구로 실행 시 코드 인젝션 위험.

#### 3. 인증 없는 채팅 API — `route.ts:42`
`POST /api/chat`에 `DASHBOARD_SECRET` 검증이 전혀 없음. 외부에서 무제한 호출 가능 → API 비용 누출, DoS 위험.

---

### 🟠 High 

---

## 2026-03-01 04:29

핵심 파일들을 병렬로 읽겠습니다.이제 전체 코드베이스를 파악했습니다. 리뷰 결과를 정리합니다.

---

## 코드 리뷰 결과

### 🔴 Critical — 즉시 수정 필요

---

**[C-1] `socket-server.ts:75` — 인증 없는 임의 명령 실행 (RCE)**

```ts
// cors: { origin: "*" } + 인증 없음
const proc = spawn("bash", ["-c", trimmed], { cwd: session.cwd, ... });
```

WebSocket에 인증이 전혀 없고 CORS가 `"*"`입니다. 네트워크에 접근 가능한 누구든 `/terminal` 네임스페이스에 연결하여 서버에서 임의 명령을 실행할 수 있습니다. `DASHBOARD_SECRET` 환경변수가 설정되어 있다면 Socket.IO 미들웨어에서 토큰 검증이 반드시 필요합니다.

---

**[C-2] `tools.ts:101-115` — Path Traversal 취약점**

```ts
// read_file / write_file — 경로 검증 전혀 없음
const fullPath = path.isAbsolute(filePath)
  ? filePath               // ← 절대 경로 그대로 허용
  : path.join(base, filePath);  // ← "../../../etc/passwd" 가능
```

`files/route.ts`는 `resolveSafePath()`로 방어하지만, `tools.ts`는 아무 검증도 없습니다. API 모드에서 에이전트가 서버의 임의 

---

## 2026-03-01 06:32

리뷰 내용을 검증하기 위해 언급된 파일들을 직접 확인하겠습니다.코드를 직접 확인했습니다. 리뷰의 정확성을 검증하고 누락된 항목을 추가합니다.

---

## 리뷰 검증 결과

### 확인된 항목 (10/10 사실 확인)

모든 10개 항목은 실제 코드에서 확인됩니다. 다만 일부는 설명이 부정확하거나 심각도 판단이 잘못됐습니다.

---

## 수정 및 보완이 필요한 리뷰 항목

### #1 Path Traversal — 심각도 조정 필요

`tools.ts:79-84`에서 SDK 모드일 때 `getAgentTools()`가 빈 배열을 반환하므로 이 취약점은 **API 모드에서만 발동**됩니다. 현재 `.env.local`이 SDK 모드 기본값으로 설정되어 있어 실제 위험도는 낮습니다. 그러나 향후 API 모드 전환 시 무방비 상태가 되므로 수정은 여전히 필수입니다.

또한 `list_files` 케이스(`:121-124`)도 동일한 절대 경로 우회가 가능한데 리뷰에서 누락됐습니다.

```typescript
case "list_files": {
  const dirPath = (toolInput.path as string) || ".";
  const fullPath = path.isAbsolute(dirPath)
    ? dirPath  // ← 여기도 검증 없음
    : path.join(base, dirPath);
```

### #3 동기 fs — `Promise.resolve()` 오해

`agent-manager.ts:146`의 코드가 문제를 악화시킵니다:

```typescript
const 

---

## 2026-03-01 06:33

보안 점검을 시작합니다. 코드베이스를 먼저 파악한 후 @security-auditor를 소집하겠습니다.전체 코드를 분석했습니다. 보안 감사 결과를 아래에 정리합니다.

---

## 🔒 보안 감사 보고서

### 🔴 심각 (Critical)

---

#### 1. 인증 없는 원격 쉘 실행 (RCE) — `socket-server.ts:75`

```ts
const proc = spawn("bash", ["-c", trimmed], { ... });
```

Socket.IO `/terminal` 네임스페이스에 **인증 없이** 연결한 클라이언트라면 누구든 서버에서 임의의 bash 명령을 실행할 수 있습니다. CORS도 `origin: "*"` 으로 완전 개방 상태입니다.

- **영향**: 서버 장악, 파일 삭제, 백도어 설치 등 모든 OS 수준 작업 가능
- **완화**: Socket.IO 연결 시 토큰/쿠키 검증 미들웨어 필수, CORS를 `localhost` 한정으로 제한

---

#### 2. 파일 API 경로 순회 미검증 (Path Traversal) — `files/route.ts:85-87`

```ts
// POST 핸들러 — resolveSafePath() 검증 없음
const targetPath = dir ? path.join(base, dir) : base;
const tree = await readDir(targetPath, depth);
```

`GET`/`PUT`은 `resolveSafePath()`로 보호되지만, **`POST` (디렉터리 트리 조회)는 검증 없이** `di

---

## 2026-03-01 06:45

## 코드 리뷰 결과

```javascript
function login(user, pass) {
  return db.query("SELECT * FROM users WHERE id=" + user)
}
```

---

### 발견된 취약점

#### 1. SQL Injection (Critical)
**가장 심각한 문제.** 사용자 입력을 쿼리에 직접 문자열 연결하고 있음.

```javascript
// 공격자 입력 예시:
user = "1 OR 1=1"
// 실행되는 쿼리:
// SELECT * FROM users WHERE id=1 OR 1=1
// → 전체 사용자 목록 반환

user = "1; DROP TABLE users; --"
// → 테이블 삭제 가능
```

#### 2. 비밀번호 검증 누락 (Critical)
`pass` 파라미터가 **완전히 무시됨**. 어떤 비밀번호를 입력해도 로그인 가능.

#### 3. `SELECT *` 사용 (High)
필요 이상의 컬럼(해시된 비밀번호, 개인정보 등) 전체 반환 → 데이터 노출 위험.

#### 4. 에러 핸들링 없음 (Medium)
`try-catch` 부재 → DB 오류 시 스택 트레이스가 클라이언트에 노출될 수 있음.

#### 5. 입력값 타입 검증 없음 (Medium)
`user`가 숫자여야 한다면 타입 체크 없음.

---

### 수정된 코드 (Node.js 예시)

```javascript
// 안전한 버전
async function login(user, pass) {
  // 입력값 기본 검증
  if (!user || !

---

## 2026-03-01 06:47

## 코드 보안 리뷰 결과

### 발견된 취약점

**1. SQL 인젝션 (Critical)**

```javascript
function getUser(id) {
  return db.query("SELECT * FROM users WHERE id=" + id)
}
```

`id` 파라미터를 문자열로 직접 연결하므로, 공격자가 다음과 같은 값을 주입할 수 있습니다:

| 입력값 | 실제 실행 쿼리 | 결과 |
|--------|--------------|------|
| `1 OR 1=1` | `WHERE id=1 OR 1=1` | 전체 사용자 데이터 유출 |
| `1; DROP TABLE users--` | `WHERE id=1; DROP TABLE users--` | 테이블 삭제 |
| `1 UNION SELECT password,null FROM admin--` | — | 관리자 비밀번호 탈취 |

**2. 입력값 검증 없음 (High)**
- `id`가 숫자인지, 문자열인지, `null`인지 전혀 확인하지 않음
- 빈 문자열 `""` 전달 시 `WHERE id=` → 쿼리 문법 오류

**3. 과도한 SELECT \* (Medium)**
- 비밀번호 해시, 토큰 등 민감 컬럼까지 모두 반환
- 필요한 컬럼만 명시해야 함

**4. 에러 핸들링 없음 (Medium)**
- DB 오류 시 raw 에러 메시지가 그대로 상위로 전파됨
- 스택 트레이스, 테이블 구조 등이 클라이언트에 노출될 수 있음

---

### 수정된 안전한 코드

```javascript
// 파라미터 바인딩(Prepared St

---

## 2026-03-02 06:20

어떤 코드를 검토해드릴까요? 다음 중 하나를 알려주세요:

1. **특정 파일 경로** — 예: `src/lib/agent-manager.ts`
2. **코드 직접 붙여넣기** — 검토할 코드를 여기에 붙여넣기
3. **전체 프로젝트 핵심 파일 리뷰** — 현재 프로젝트의 주요 파일들 일괄 검토

---
