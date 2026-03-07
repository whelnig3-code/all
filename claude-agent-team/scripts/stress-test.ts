/**
 * scripts/stress-test.ts
 * Soft Budget 산정을 위한 120회 체인 스트레스 테스트
 *
 * ── 사전 준비 (로그 캡처) ──────────────────────────────────────────────────
 * 서버를 아래 명령으로 재시작하여 CHAIN_SUMMARY 로그를 파일에 캡처합니다:
 *
 *   Windows (PowerShell):
 *     node start-server.js 2>&1 | Tee-Object chain_stress.log
 *
 *   Linux/macOS:
 *     node start-server.js 2>&1 | tee chain_stress.log
 *
 * ── 실행 방법 ────────────────────────────────────────────────────────────────
 *   node node_modules/tsx/dist/cli.mjs scripts/stress-test.ts
 *   node node_modules/tsx/dist/cli.mjs scripts/stress-test.ts --mock         # 합성 데이터 즉시 생성
 *   node node_modules/tsx/dist/cli.mjs scripts/stress-test.ts --groups A,B   # 특정 그룹만 실행
 *   node node_modules/tsx/dist/cli.mjs scripts/stress-test.ts --limit 10     # 최대 N회만 실행
 *
 * ── 예상 소요 시간 (SDK 모드 기준) ───────────────────────────────────────────
 *   Group A (36회 × ~25s)  ≈  15분
 *   Group B (36회 × ~55s)  ≈  33분
 *   Group C (30회 × ~85s)  ≈  43분
 *   Group D (18회 × ~105s) ≈  32분
 *   합계: 약 2~3시간 (rate limit 지연 포함)
 *
 * ── 완료 후 ──────────────────────────────────────────────────────────────────
 *   서버 로그에서 CHAIN_SUMMARY 라인만 추출:
 *     grep "CHAIN_SUMMARY" chain_stress.log > chain_summary_only.log
 *   분석 실행:
 *     node node_modules/tsx/dist/cli.mjs scripts/telemetry-analyzer.ts chain_summary_only.log
 */

import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import * as child_process from "child_process";

// ─── CLI 옵션 ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const IS_MOCK     = args.includes("--mock");
const GROUPS_ARG  = args.find(a => a.startsWith("--groups="))?.split("=")[1]
                 ?? args[args.indexOf("--groups") + 1];
const LIMIT_ARG   = args.find(a => a.startsWith("--limit="))?.split("=")[1]
                 ?? args[args.indexOf("--limit") + 1];

const ACTIVE_GROUPS = GROUPS_ARG ? new Set(GROUPS_ARG.toUpperCase().split(",")) : new Set(["A","B","C","D"]);
const LIMIT         = LIMIT_ARG ? Number(LIMIT_ARG) : Infinity;

// ─── 설정 ─────────────────────────────────────────────────────────────────────

const HOST               = "localhost";
const PORT               = 3000;
const LOG_FILE           = path.resolve("chain_stress.log");       // 최종 로그 (서버가 tee로 씀)
const PROGRESS_FILE      = path.resolve("chain_stress_progress.json");
const REQUEST_TIMEOUT_MS = 200_000;   // 3분 20초 (Hard Budget 120s + 여유)
const BETWEEN_DELAY_MS   = 3_000;    // 요청 간 3초 (rate limit 예방)
const RATE_LIMIT_SLEEP   = 90_000;   // 429 응답 시 90초 대기

// ─── 테스트 케이스 정의 ───────────────────────────────────────────────────────

interface TestCase {
  group:   "A" | "B" | "C" | "D";
  agent:   string;   // 시작 에이전트
  prompt:  string;   // 전송할 메시지
  targetHops: number; // 예상 hopCount
}

// Group A (36회) — hopCount 2 목표: "리뷰" 키워드 포함, 안전한 코드 → developer→reviewer
// ⚠️ 라우팅 규칙: developer + "리뷰" → nextCandidates=["reviewer"] → 2-hop CHAIN_SUMMARY 발화
// ⚠️ "보안/취약" 키워드 없음 → developer nextCandidates에 security-auditor 미포함 → 2-hop 고정
const GROUP_A: TestCase[] = [
  { group:"A", agent:"developer", targetHops:2, prompt:"TypeScript로 배열에서 중복을 제거하는 제네릭 함수를 작성하고 코드 리뷰해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"JavaScript에서 delay 파라미터를 지원하는 debounce 함수를 구현하고 코드 검토해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"TypeScript에서 Generic Constraints를 활용하는 유틸리티 함수를 작성하고 리뷰해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"React의 useMemo와 useCallback을 적절히 사용하는 컴포넌트 예제를 작성하고 코드 리뷰해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"TypeScript의 mapped types로 객체의 모든 키를 optional로 만드는 유틸리티 타입을 작성하고 리뷰해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"Array.prototype.reduce를 사용해 객체 배열을 딕셔너리로 변환하는 함수를 작성하고 코드 검토해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"TypeScript의 discriminated union 패턴을 활용한 상태 머신을 작성하고 리뷰해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"async/await를 사용해 병렬 API 호출을 처리하고 에러를 핸들링하는 함수를 작성하고 코드 리뷰해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"TypeScript의 conditional types를 활용한 타입 추론 유틸리티를 작성하고 리뷰해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"Promise.all과 Promise.allSettled를 적절히 선택하는 예제를 작성하고 코드 검토해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"TypeScript에서 infer 키워드를 활용해 함수 반환 타입을 추출하는 유틸리티를 작성하고 리뷰해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"TypeScript의 satisfies 연산자를 활용하는 실용적인 예제를 작성하고 코드 리뷰해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"TypeScript의 never 타입을 exhaustive check에 활용하는 패턴을 작성하고 리뷰해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"ESM 모듈로 Node.js 유틸리티 라이브러리를 작성하고 코드 검토해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"React에서 useMemo로 비용이 큰 계산을 최적화하는 컴포넌트를 작성하고 리뷰해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"Next.js App Router에서 layout.tsx와 page.tsx를 올바르게 구성하는 예제를 작성하고 코드 리뷰해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"TypeScript로 Observer 패턴을 타입 안전하게 구현하고 리뷰해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"React에서 Context API로 테마 시스템을 구현하고 코드 검토해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"TypeScript의 Partial, Required, Pick, Omit 유틸리티 타입을 활용하는 예제를 작성하고 리뷰해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"Node.js에서 EventEmitter를 타입 안전하게 래핑하는 클래스를 작성하고 코드 검토해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"React에서 useReducer로 복잡한 폼 상태를 관리하는 훅을 작성하고 리뷰해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"TypeScript에서 Builder 패턴을 메서드 체이닝으로 구현하고 코드 리뷰해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"JavaScript의 WeakMap과 WeakSet을 활용하는 캐시 유틸리티를 작성하고 리뷰해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"TypeScript로 Monad 패턴(Maybe/Result)을 구현하고 코드 검토해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"React에서 forwardRef와 useImperativeHandle을 올바르게 사용하는 컴포넌트를 작성하고 리뷰해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"TypeScript의 Template Literal Types를 활용한 이벤트 이름 타입 시스템을 작성하고 코드 리뷰해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"Node.js에서 Readable/Writable 스트림을 파이프라인으로 연결하는 유틸리티를 작성하고 리뷰해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"TypeScript로 커리(currying) 함수를 타입 안전하게 구현하고 코드 검토해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"React 18의 useTransition으로 무거운 렌더링을 처리하는 컴포넌트를 작성하고 리뷰해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"TypeScript로 간단한 파서(parser)를 작성하고 코드 리뷰해줘. 사칙연산 수식을 파싱해야 해." },
  { group:"A", agent:"developer", targetHops:2, prompt:"Node.js에서 Worker Threads로 CPU 집약적 작업을 오프로드하는 코드를 작성하고 리뷰해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"TypeScript로 Proxy를 활용한 반응형 객체를 구현하고 코드 검토해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"React에서 커스텀 훅 useDebounce와 useThrottle을 구현하고 리뷰해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"TypeScript의 Record 타입을 활용한 설정 관리 모듈을 작성하고 코드 리뷰해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"Node.js에서 p-queue 없이 동시성 제한 큐를 구현하고 리뷰해줘." },
  { group:"A", agent:"developer", targetHops:2, prompt:"TypeScript로 간단한 의존성 주입 컨테이너를 구현하고 코드 검토해줘." },
];

// Group B (36회) — hopCount 2 목표: "리뷰" 키워드로 developer→reviewer 유도
const GROUP_B: TestCase[] = [
  { group:"B", agent:"developer", targetHops:2, prompt:"TypeScript로 JWT 토큰 생성 함수를 작성하고 코드 리뷰해줘: function createToken(payload: object, secret: string): string { return jwt.sign(payload, secret); }" },
  { group:"B", agent:"developer", targetHops:2, prompt:"이 Next.js API route를 작성하고 코드 검토해줘. POST /api/users 엔드포인트로 사용자를 생성하는 기능이야." },
  { group:"B", agent:"developer", targetHops:2, prompt:"React에서 무한 스크롤 컴포넌트를 구현하고 코드 리뷰해줘. IntersectionObserver API를 사용해야 해." },
  { group:"B", agent:"developer", targetHops:2, prompt:"TypeScript로 이진 탐색 트리를 구현하고 코드 검토해줘. insert, search, delete 메서드 포함해야 해." },
  { group:"B", agent:"developer", targetHops:2, prompt:"Node.js 미들웨어를 작성하고 리뷰해줘. 요청 로깅과 응답 시간 측정 기능이야." },
  { group:"B", agent:"developer", targetHops:2, prompt:"React의 커스텀 훅 useLocalStorage를 구현하고 코드 검토해줘." },
  { group:"B", agent:"developer", targetHops:2, prompt:"TypeScript로 Observer 패턴을 구현하고 리뷰해줘." },
  { group:"B", agent:"developer", targetHops:2, prompt:"Node.js에서 파일을 스트림으로 읽어 처리하는 함수를 작성하고 코드 리뷰해줘." },
  { group:"B", agent:"developer", targetHops:2, prompt:"React Context + useReducer로 글로벌 상태 관리를 구현하고 코드 검토해줘." },
  { group:"B", agent:"developer", targetHops:2, prompt:"TypeScript로 LRU 캐시를 구현하고 리뷰해줘. Map을 활용해야 해." },
  { group:"B", agent:"developer", targetHops:2, prompt:"Next.js의 middleware.ts를 작성하고 코드 검토해줘. 인증 체크 기능이야." },
  { group:"B", agent:"developer", targetHops:2, prompt:"TypeScript로 이벤트 버스(Event Bus) 패턴을 구현하고 리뷰해줘." },
  { group:"B", agent:"developer", targetHops:2, prompt:"React에서 drag-and-drop 기능을 구현하고 코드 리뷰해줘. 외부 라이브러리 없이 순수 JS로." },
  { group:"B", agent:"developer", targetHops:2, prompt:"Node.js에서 Redis 연결 풀을 구현하고 코드 검토해줘." },
  { group:"B", agent:"developer", targetHops:2, prompt:"TypeScript로 Trie 자료구조를 구현하고 리뷰해줘. 자동완성 기능에 사용할 예정이야." },
  { group:"B", agent:"developer", targetHops:2, prompt:"React에서 가상화 목록(virtualized list) 컴포넌트를 구현하고 코드 검토해줘." },
  { group:"B", agent:"developer", targetHops:2, prompt:"TypeScript로 의존성 주입(DI) 컨테이너를 간단히 구현하고 리뷰해줘." },
  { group:"B", agent:"developer", targetHops:2, prompt:"Next.js에서 이미지 최적화 컴포넌트를 구현하고 코드 검토해줘. lazy loading 포함." },
  { group:"B", agent:"developer", targetHops:2, prompt:"Node.js에서 작업 큐(job queue)를 구현하고 리뷰해줘. 재시도 로직 포함해야 해." },
  { group:"B", agent:"developer", targetHops:2, prompt:"TypeScript로 상태 머신(state machine)을 구현하고 코드 검토해줘." },
  { group:"B", agent:"developer", targetHops:2, prompt:"React에서 웹소켓 연결 관리 훅을 구현하고 리뷰해줘. 자동 재연결 포함." },
  { group:"B", agent:"developer", targetHops:2, prompt:"TypeScript로 GraphQL 스키마 유효성 검사를 구현하고 코드 검토해줘." },
  { group:"B", agent:"developer", targetHops:2, prompt:"Node.js에서 rate limiter를 구현하고 리뷰해줘. sliding window 알고리즘 사용해야 해." },
  { group:"B", agent:"developer", targetHops:2, prompt:"React에서 폼 유효성 검사 훅을 구현하고 코드 검토해줘. 비동기 유효성도 지원해야 해." },
  { group:"B", agent:"developer", targetHops:2, prompt:"TypeScript로 Promise 체인을 retry 로직으로 감싸는 함수를 구현하고 리뷰해줘." },
  { group:"B", agent:"developer", targetHops:2, prompt:"Node.js에서 멀티파트 파일 업로드 처리를 구현하고 코드 검토해줘." },
  { group:"B", agent:"developer", targetHops:2, prompt:"React에서 오프라인 지원을 위한 Service Worker 훅을 구현하고 리뷰해줘." },
  { group:"B", agent:"developer", targetHops:2, prompt:"TypeScript로 커맨드 패턴을 구현하고 코드 검토해줘. undo/redo 지원해야 해." },
  { group:"B", agent:"developer", targetHops:2, prompt:"Next.js에서 SSE(Server-Sent Events) 엔드포인트를 구현하고 리뷰해줘." },
  { group:"B", agent:"developer", targetHops:2, prompt:"Node.js에서 JWT 갱신 로직을 구현하고 코드 검토해줘. refresh token 포함." },
  { group:"B", agent:"developer", targetHops:2, prompt:"React에서 Intersection Observer를 사용한 애니메이션 훅을 구현하고 리뷰해줘." },
  { group:"B", agent:"developer", targetHops:2, prompt:"TypeScript로 싱글톤 패턴을 구현하고 코드 검토해줘. 멀티스레드 환경 고려해야 해." },
  { group:"B", agent:"developer", targetHops:2, prompt:"Node.js에서 분산 락(distributed lock)을 Redis로 구현하고 리뷰해줘." },
  { group:"B", agent:"developer", targetHops:2, prompt:"React에서 포탈(Portal)을 사용한 모달 시스템을 구현하고 코드 검토해줘." },
  { group:"B", agent:"developer", targetHops:2, prompt:"TypeScript로 파이프라인 패턴을 구현하고 리뷰해줘. 비동기 파이프라인도 지원해야 해." },
  { group:"B", agent:"developer", targetHops:2, prompt:"Next.js에서 국제화(i18n)를 구현하고 코드 검토해줘. 동적 로케일 전환 지원해야 해." },
];

// Group C (30회) — hopCount 3 목표: "리뷰/검토" 키워드만 포함 + 취약한 코드 인라인
// ⚠️ 라우팅 설계:
//   - 프롬프트에 "보안/취약/감사" 키워드 없음 → developer nextCandidates[0]="reviewer" (2-hop)
//   - developer가 취약한 코드를 분석하면서 "취약점/인젝션/노출" 등을 자연스럽게 언급
//   - reviewer의 입력 메시지에 해당 키워드 포함 → reviewer nextCandidates[0]="security-auditor" (3-hop)
const GROUP_C: TestCase[] = [
  // C01: SQL Injection (로그인 API)
  { group:"C", agent:"developer", targetHops:3, prompt:"이 로그인 API를 완성하고 코드 리뷰해줘: app.post('/login', async (req, res) => { const user = await db.query(`SELECT * FROM users WHERE email='${req.body.email}' AND pass='${req.body.password}'`); if (user.rows.length) res.json({ token: 'hardcoded-secret-token', user: user.rows[0] }); else res.status(401).json({ error: 'fail' }); });" },

  // C02: 평문 비밀번호 저장 (회원가입 API)
  { group:"C", agent:"developer", targetHops:3, prompt:"이 회원가입 API를 완성하고 코드 리뷰해줘: app.post('/register', async (req, res) => { const { email, password, role } = req.body; await db.query('INSERT INTO users(email, password, role) VALUES($1,$2,$3)', [email, password, role || 'admin']); res.json({ ok: true }); });" },

  // C03: Path Traversal (파일 다운로드)
  { group:"C", agent:"developer", targetHops:3, prompt:"이 파일 다운로드 API를 완성하고 코드 검토해줘: app.get('/download', (req, res) => { const filename = req.query.file as string; const filepath = path.join('/var/uploads', filename); res.sendFile(filepath); });" },

  // C04: Command Injection (ping API)
  { group:"C", agent:"developer", targetHops:3, prompt:"이 네트워크 진단 API를 완성하고 코드 리뷰해줘: app.get('/ping', (req, res) => { const host = req.query.host; exec(`ping -c 3 ${host}`, (err, stdout) => { res.json({ result: stdout }); }); });" },

  // C05: SSRF (이미지 프록시)
  { group:"C", agent:"developer", targetHops:3, prompt:"이 이미지 프록시 API를 완성하고 코드 검토해줘: app.get('/proxy', async (req, res) => { const url = req.query.url as string; const response = await fetch(url); const buffer = await response.arrayBuffer(); res.send(Buffer.from(buffer)); });" },

  // C06: 인증 없는 관리자 API
  { group:"C", agent:"developer", targetHops:3, prompt:"이 사용자 관리 API를 완성하고 코드 리뷰해줘: app.get('/admin/users', async (req, res) => { const users = await db.query('SELECT id, email, password_hash, credit_card, ssn FROM users'); res.json(users.rows); }); app.delete('/admin/users/:id', async (req, res) => { await db.query('DELETE FROM users WHERE id=$1', [req.params.id]); res.json({ deleted: true }); });" },

  // C07: JWT 서명 미검증
  { group:"C", agent:"developer", targetHops:3, prompt:"이 JWT 인증 미들웨어를 완성하고 코드 검토해줘: function authMiddleware(req, res, next) { const token = req.headers.authorization?.split(' ')[1]; if (!token) return res.status(401).json({ error: 'no token' }); const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()); req.user = decoded; next(); }" },

  // C08: Mass Assignment (프로필 업데이트)
  { group:"C", agent:"developer", targetHops:3, prompt:"이 프로필 업데이트 API를 완성하고 코드 리뷰해줘: app.put('/users/:id', async (req, res) => { const updates = req.body; const setClauses = Object.keys(updates).map((k, i) => `${k}=$${i+1}`).join(','); await db.query(`UPDATE users SET ${setClauses} WHERE id=$${Object.keys(updates).length+1}`, [...Object.values(updates), req.params.id]); res.json({ ok: true }); });" },

  // C09: eval 인젝션 (계산기 API)
  { group:"C", agent:"developer", targetHops:3, prompt:"이 수식 계산 API를 완성하고 코드 검토해줘: app.post('/calculate', (req, res) => { const { expression } = req.body; const result = eval(expression); res.json({ result }); });" },

  // C10: ReDoS (이메일 유효성 검사)
  { group:"C", agent:"developer", targetHops:3, prompt:"이 이메일 유효성 검사 미들웨어를 완성하고 코드 리뷰해줘: function validateEmail(email: string): boolean { return /^([a-zA-Z0-9]+)+((\.[a-zA-Z0-9]+)+)*@(([a-zA-Z0-9]+)+((\.[a-zA-Z0-9]+)+)*)+\\.([a-zA-Z]{2,})+$/.test(email); } app.post('/signup', (req, res) => { if (!validateEmail(req.body.email)) return res.status(400).json({ error: 'invalid' }); res.json({ ok: true }); });" },

  // C11: Insecure Deserialization (Node.js)
  { group:"C", agent:"developer", targetHops:3, prompt:"이 세션 복원 API를 완성하고 코드 검토해줘: app.post('/session/restore', (req, res) => { const sessionData = Buffer.from(req.body.session, 'base64').toString(); const session = JSON.parse(sessionData); if (session._type === 'admin') { global[session.action](session.args); } req.session = session; res.json({ ok: true }); });" },

  // C12: NoSQL Injection (MongoDB)
  { group:"C", agent:"developer", targetHops:3, prompt:"이 MongoDB 로그인 API를 완성하고 코드 리뷰해줘: app.post('/login', async (req, res) => { const { username, password } = req.body; const user = await User.findOne({ username: username, password: password }); if (user) res.json({ token: generateToken(user), isAdmin: user.role === 'admin' }); else res.status(401).json({ error: 'fail' }); });" },

  // C13: Open Redirect
  { group:"C", agent:"developer", targetHops:3, prompt:"이 OAuth 콜백 핸들러를 완성하고 코드 검토해줘: app.get('/oauth/callback', async (req, res) => { const { code, redirect_uri } = req.query; const token = await exchangeCodeForToken(code as string); res.cookie('auth_token', token, { httpOnly: false }); res.redirect(redirect_uri as string); });" },

  // C14: 하드코딩 시크릿 (DB 연결)
  { group:"C", agent:"developer", targetHops:3, prompt:"이 데이터베이스 연결 모듈을 완성하고 코드 리뷰해줘: const db = new Pool({ host: 'prod-db.internal.example.com', user: 'postgres', password: 'Prod@2024!SuperSecret', database: 'users_db', ssl: false, max: 100 }); export const query = (sql: string, params?: any[]) => db.query(sql, params);" },

  // C15: Prototype Pollution
  { group:"C", agent:"developer", targetHops:3, prompt:"이 설정 병합 유틸리티를 완성하고 코드 검토해줘: function mergeConfig(target: any, source: any): any { for (const key of Object.keys(source)) { if (typeof source[key] === 'object' && source[key] !== null) { if (!target[key]) target[key] = {}; mergeConfig(target[key], source[key]); } else { target[key] = source[key]; } } return target; } app.post('/config', (req, res) => { const config = mergeConfig(globalConfig, req.body); res.json(config); });" },

  // C16: 타이밍 공격 (토큰 비교)
  { group:"C", agent:"developer", targetHops:3, prompt:"이 API 키 인증 미들웨어를 완성하고 코드 리뷰해줘: function apiKeyAuth(req, res, next) { const apiKey = req.headers['x-api-key']; if (apiKey === process.env.MASTER_API_KEY) { next(); } else { const userKey = db.getApiKey(req.user?.id); if (apiKey === userKey) next(); else res.status(403).json({ error: 'forbidden' }); } }" },

  // C17: XXE Injection (XML 파서)
  { group:"C", agent:"developer", targetHops:3, prompt:"이 XML 파싱 API를 완성하고 코드 검토해줘: import { parseStringPromise } from 'xml2js'; app.post('/parse-xml', async (req, res) => { const result = await parseStringPromise(req.body.xml, { explicitArray: false, strict: false }); const data = extractUserData(result); await db.saveUserData(req.user.id, data); res.json({ processed: true, fields: Object.keys(data) }); });" },

  // C18: 레이스 컨디션 (포인트 차감)
  { group:"C", agent:"developer", targetHops:3, prompt:"이 포인트 차감 API를 완성하고 코드 리뷰해줘: app.post('/purchase', async (req, res) => { const user = await db.query('SELECT points FROM users WHERE id=$1', [req.user.id]); if (user.rows[0].points < req.body.amount) return res.status(400).json({ error: 'insufficient' }); await db.query('UPDATE users SET points=points-$1 WHERE id=$2', [req.body.amount, req.user.id]); await db.query('INSERT INTO purchases VALUES($1,$2)', [req.user.id, req.body.item_id]); res.json({ ok: true }); });" },

  // C19: 민감 정보 URL 노출 (검색 API)
  { group:"C", agent:"developer", targetHops:3, prompt:"이 사용자 검색 API를 완성하고 코드 검토해줘: app.get('/search', async (req, res) => { const { q, userId, sessionToken, apiKey } = req.query; console.log(`Search: q=${q} userId=${userId} token=${sessionToken} key=${apiKey}`); const results = await db.query('SELECT * FROM users WHERE name ILIKE $1', [`%${q}%`]); res.json(results.rows); });" },

  // C20: 취약한 난수 생성 (OTP)
  { group:"C", agent:"developer", targetHops:3, prompt:"이 OTP 생성 및 검증 API를 완성하고 코드 리뷰해줘: app.post('/otp/generate', (req, res) => { const otp = Math.floor(Math.random() * 9000 + 1000).toString(); otpStore.set(req.user.id, { otp, expires: Date.now() + 600000, attempts: 0 }); sendSms(req.user.phone, `Your OTP is ${otp}`); res.json({ sent: true }); }); app.post('/otp/verify', (req, res) => { const record = otpStore.get(req.user.id); if (record && record.otp === req.body.otp) res.json({ verified: true }); else res.status(400).json({ error: 'invalid' }); });" },

  // C21: CSRF 미방어 (상태 변경 API)
  { group:"C", agent:"developer", targetHops:3, prompt:"이 비밀번호 변경 API를 완성하고 코드 검토해줘: app.post('/change-password', async (req, res) => { const { newPassword } = req.body; const userId = req.session?.userId; if (!userId) return res.status(401).json({ error: 'unauthenticated' }); await db.query('UPDATE users SET password=$1 WHERE id=$2', [newPassword, userId]); res.json({ changed: true }); });" },

  // C22: 로그 인젝션 (접근 로그)
  { group:"C", agent:"developer", targetHops:3, prompt:"이 감사 로그 기록 미들웨어를 완성하고 코드 리뷰해줘: app.use((req, res, next) => { const userAgent = req.headers['user-agent']; const username = req.body?.username ?? req.query?.user; console.log(`[ACCESS] ${new Date().toISOString()} user=${username} ua=${userAgent} ip=${req.ip} path=${req.path}`); fs.appendFileSync('access.log', `${username}|${userAgent}|${req.ip}|${req.path}\n`); next(); });" },

  // C23: 미인증 파일 삭제
  { group:"C", agent:"developer", targetHops:3, prompt:"이 파일 관리 API를 완성하고 코드 검토해줘: app.delete('/files/:name', async (req, res) => { const filename = req.params.name; const filepath = path.join(UPLOAD_DIR, filename); fs.unlinkSync(filepath); await db.query('DELETE FROM files WHERE name=$1', [filename]); res.json({ deleted: filename }); });" },

  // C24: IDOR (타인 데이터 접근)
  { group:"C", agent:"developer", targetHops:3, prompt:"이 주문 조회 API를 완성하고 코드 리뷰해줘: app.get('/orders/:orderId', async (req, res) => { const order = await db.query('SELECT * FROM orders WHERE id=$1', [req.params.orderId]); if (!order.rows.length) return res.status(404).json({ error: 'not found' }); res.json(order.rows[0]); }); app.get('/orders/:orderId/invoice', async (req, res) => { const order = await db.query('SELECT o.*, u.credit_card FROM orders o JOIN users u ON o.user_id=u.id WHERE o.id=$1', [req.params.orderId]); res.json(order.rows[0]); });" },

  // C25: 서버 에러 스택 노출
  { group:"C", agent:"developer", targetHops:3, prompt:"이 글로벌 에러 핸들러를 완성하고 코드 검토해줘: app.use((err: Error, req: Request, res: Response, next: NextFunction) => { console.error(err); res.status(500).json({ error: err.message, stack: err.stack, config: { db: process.env.DATABASE_URL, secret: process.env.JWT_SECRET, apiKey: process.env.API_KEY } }); });" },

  // C26: 환경변수 일괄 노출 API
  { group:"C", agent:"developer", targetHops:3, prompt:"이 시스템 상태 확인 API를 완성하고 코드 리뷰해줘: app.get('/health', (req, res) => { res.json({ status: 'ok', version: process.version, env: process.env, uptime: process.uptime(), memory: process.memoryUsage() }); });" },

  // C27: 무제한 요청 속도 (비밀번호 무차별 대입 가능)
  { group:"C", agent:"developer", targetHops:3, prompt:"이 로그인 API를 완성하고 코드 검토해줘: app.post('/auth/login', async (req, res) => { const { email, password } = req.body; const user = await User.findOne({ email }); if (!user) return res.status(401).json({ error: 'not found' }); const match = user.password === sha1(password); if (!match) { await AuditLog.create({ action: 'LOGIN_FAIL', email }); return res.status(401).json({ error: 'wrong password' }); } const token = jwt.sign({ id: user.id, role: user.role }, 'secret'); res.json({ token }); });" },

  // C28: 외부 입력으로 require/import
  { group:"C", agent:"developer", targetHops:3, prompt:"이 플러그인 로더를 완성하고 코드 리뷰해줘: app.post('/plugins/load', (req, res) => { const { pluginName } = req.body; const plugin = require(`./plugins/${pluginName}`); const result = plugin.execute(req.body.options); res.json({ result }); }); app.get('/plugins/list', (req, res) => { const plugins = fs.readdirSync('./plugins'); res.json({ plugins }); });" },

  // C29: 암호화 없는 민감 데이터 저장
  { group:"C", agent:"developer", targetHops:3, prompt:"이 사용자 결제 정보 저장 API를 완성하고 코드 검토해줘: app.post('/payment/save', async (req, res) => { const { cardNumber, cvv, expiryDate, cardHolder } = req.body; await db.query('INSERT INTO payment_methods(user_id, card_number, cvv, expiry, holder) VALUES($1,$2,$3,$4,$5)', [req.user.id, cardNumber, cvv, expiryDate, cardHolder]); res.json({ saved: true, last4: cardNumber.slice(-4) }); });" },

  // C30: 세션 고정 공격 (session fixation)
  { group:"C", agent:"developer", targetHops:3, prompt:"이 로그인 세션 처리 코드를 완성하고 코드 리뷰해줘: app.post('/login', async (req, res) => { const user = await authenticate(req.body.email, req.body.password); if (!user) return res.status(401).json({ error: 'fail' }); req.session.userId = user.id; req.session.role = user.role; req.session.loginTime = Date.now(); res.json({ ok: true, sessionId: req.session.id, userId: user.id }); });" },
];

// Group D (18회) — hopCount 3 + Hard Budget 근접: 매우 복잡한 다단계 요청
const GROUP_D: TestCase[] = [
  { group:"D", agent:"developer", targetHops:3, prompt:"레거시 Node.js 모놀리스 애플리케이션을 마이크로서비스로 분해하는 전체 계획을 수립하고 핵심 서비스 코드를 구현한 뒤 코드 리뷰, 보안 취약점 감사까지 전체 파이프라인을 실행해줘. 사용자 서비스, 인증 서비스, 알림 서비스를 분리해야 해." },
  { group:"D", agent:"developer", targetHops:3, prompt:"대규모 트래픽을 처리하는 실시간 채팅 시스템의 백엔드를 설계하고 구현한 뒤 코드 리뷰와 보안 감사를 수행해줘. WebSocket 클러스터링, 메시지 지속성, DDOS 방어, XSS/CSRF 취약점 분석이 모두 포함되어야 해." },
  { group:"D", agent:"developer", targetHops:3, prompt:"JWT 기반 인증 시스템의 전체 보안 아키텍처를 설계하고 구현한 뒤 코드 리뷰, 취약점 분석, OWASP Top 10 대조 감사까지 해줘. Access Token, Refresh Token, Device Fingerprinting, 세션 고정 공격 방어가 포함되어야 해." },
  { group:"D", agent:"developer", targetHops:3, prompt:"전자상거래 플랫폼의 결제 처리 시스템을 구현하고 코드 리뷰한 뒤 PCI-DSS 관점에서 보안 감사해줘. 카드 토큰화, 3D Secure 인증, 환불 처리, 사기 탐지 기능이 필요해." },
  { group:"D", agent:"developer", targetHops:3, prompt:"멀티테넌트 SaaS 플랫폼의 데이터 격리 시스템을 설계하고 구현한 뒤 코드 리뷰와 보안 감사해줘. 테넌트 간 데이터 유출 방지, 행 수준 보안(RLS), API 격리, 감사 로그가 모두 포함되어야 해." },
  { group:"D", agent:"developer", targetHops:3, prompt:"실시간 대시보드 API 시스템을 구현하고 코드 리뷰, 보안 취약점 분석, 성능 병목 진단까지 수행해줘. WebSocket, SSE, 폴링 세 가지 방식을 지원하고 권한 기반 데이터 필터링이 필요해." },
  { group:"D", agent:"developer", targetHops:3, prompt:"API 게이트웨이를 구현하고 코드 리뷰와 보안 감사 해줘. Rate limiting, Circuit Breaker, JWT 검증, IP 화이트리스트, 요청 로깅, 응답 캐싱 기능을 모두 포함하고 OWASP API Security Top 10 기준으로 취약점을 점검해줘." },
  { group:"D", agent:"developer", targetHops:3, prompt:"사용자 권한 관리 시스템(RBAC + ABAC)을 설계하고 구현한 뒤 코드 리뷰와 보안 감사를 해줘. 역할 계층 구조, 속성 기반 규칙, 동적 권한 평가, 권한 에스컬레이션 방지가 모두 포함되어야 해." },
  { group:"D", agent:"developer", targetHops:3, prompt:"파일 저장소 서비스를 구현하고 코드 리뷰한 뒤 보안 취약점을 분석해줘. S3 연동, 바이러스 스캔, 파일 타입 검증, Path Traversal 방어, 서명된 URL 생성, 대용량 파일 청크 업로드 지원해야 해." },
  { group:"D", agent:"developer", targetHops:3, prompt:"GraphQL API 서버를 구현하고 코드 리뷰와 보안 감사해줘. N+1 문제 해결(DataLoader), 쿼리 깊이 제한, 인트로스펙션 차단, 뮤테이션 권한 검사, 배치 요청 공격 방어가 포함되어야 해." },
  { group:"D", agent:"developer", targetHops:3, prompt:"이벤트 소싱(Event Sourcing) + CQRS 패턴으로 주문 처리 시스템을 구현하고 코드 리뷰한 뒤 보안 취약점 감사해줘. 이벤트 저장소, 프로젝션, 사가 패턴, 멱등성 보장, 재시도 폭풍 방어가 필요해." },
  { group:"D", agent:"developer", targetHops:3, prompt:"컨테이너 오케스트레이션 플랫폼의 API를 구현하고 코드 리뷰와 보안 감사해줘. 컨테이너 이스케이프 방지, 리소스 제한, 네트워크 격리, 시크릿 관리, 감사 로그가 모두 포함되어야 해." },
  { group:"D", agent:"developer", targetHops:3, prompt:"실시간 알림 시스템의 전체 스택을 구현하고 코드 리뷰, 보안 취약점 분석, GDPR 컴플라이언스 감사까지 해줘. 이메일, SMS, 푸시, 웹소켓 알림을 지원하고 수신자 데이터 보호가 중요해." },
  { group:"D", agent:"developer", targetHops:3, prompt:"분산 캐시 시스템을 구현하고 코드 리뷰한 뒤 보안 감사해줘. Redis 클러스터, 캐시 포이즈닝 방어, 타임아웃 처리, 서킷 브레이커, 캐시 무효화 전략, 민감 데이터 암호화가 포함되어야 해." },
  { group:"D", agent:"developer", targetHops:3, prompt:"소셜 로그인 통합 서비스를 구현하고 코드 리뷰와 보안 감사해줘. OAuth 2.0, OIDC, PKCE 플로우를 지원하고 State 파라미터 검증, 토큰 바인딩, 오픈 리다이렉트 방어, 계정 연동 취약점 분석이 포함되어야 해." },
  { group:"D", agent:"developer", targetHops:3, prompt:"서버리스 함수 플랫폼 API를 구현하고 코드 리뷰한 뒤 보안 취약점을 감사해줘. 코드 인젝션 방어, 리소스 격리, 타임아웃 제한, 콜드 스타트 최적화, 함수 간 통신 보안이 모두 포함되어야 해." },
  { group:"D", agent:"developer", targetHops:3, prompt:"데이터 파이프라인 시스템을 구현하고 코드 리뷰와 보안 감사를 해줘. 외부 소스에서 데이터를 수집하고 변환하여 저장하는 ETL 파이프라인이야. 데이터 검증, 민감 정보 마스킹, 접근 제어, SQL 인젝션 방어, SSRF 방지가 필요해." },
  { group:"D", agent:"developer", targetHops:3, prompt:"암호화폐 거래소 API를 구현하고 코드 리뷰한 뒤 전체 보안 감사를 수행해줘. 주문서 관리, 자산 잔액 추적, 이중 지불 방지, 거래 원자성 보장, 내부자 거래 탐지, 키 관리, OWASP 기준 취약점 분석이 모두 필요해." },
];

// ─── 전체 테스트 케이스 조합 ───────────────────────────────────────────────────

const ALL_CASES: TestCase[] = [
  ...(ACTIVE_GROUPS.has("A") ? GROUP_A : []),
  ...(ACTIVE_GROUPS.has("B") ? GROUP_B : []),
  ...(ACTIVE_GROUPS.has("C") ? GROUP_C : []),
  ...(ACTIVE_GROUPS.has("D") ? GROUP_D : []),
].slice(0, LIMIT === Infinity ? undefined : LIMIT);

// ─── 진행 상태 (재시작 지원) ──────────────────────────────────────────────────

interface Progress {
  completed: number;
  failed:    number;
  startedAt: string;
}

function loadProgress(): Progress {
  if (fs.existsSync(PROGRESS_FILE)) {
    try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8")); } catch {}
  }
  return { completed: 0, failed: 0, startedAt: new Date().toISOString() };
}

function saveProgress(p: Progress): void {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

// ─── HTTP 요청 (SSE 스트림 소비) ──────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendChatRequest(
  prompt: string,
  agentId: string,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<"done" | "timeout" | "error" | "rate-limit"> {
  const convId = `stress-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  // API는 targetAgent 필드를 읽음 (agentId 아님 — ChatRequest 타입 기준)
  const body   = JSON.stringify({ conversationId: convId, message: prompt, targetAgent: agentId });

  return new Promise((resolve) => {
    const req = http.request(
      { hostname: HOST, port: PORT, path: "/api/chat", method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
      (res) => {
        // 429 Rate Limit 감지
        if (res.statusCode === 429) { resolve("rate-limit"); return; }

        let buf = "";
        res.on("data", (chunk: Buffer) => {
          buf += chunk.toString();
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const ev = JSON.parse(line.slice(6));
              if (ev.type === "done") { resolve("done"); return; }
            } catch {}
          }
        });
        res.on("end", () => resolve("done"));
        res.on("error", () => resolve("error"));
      }
    );

    req.on("error", () => resolve("error"));

    // 타임아웃 처리
    const timer = setTimeout(() => {
      req.destroy();
      resolve("timeout");
    }, timeoutMs);

    req.socket?.on("close", () => clearTimeout(timer));
    res_cleanup: { req.on("close", () => clearTimeout(timer)); }

    req.write(body);
    req.end();
  });
}

// ─── 합성 로그 생성 (--mock 모드) ────────────────────────────────────────────

function generateMockLogs(): void {
  console.log("\n🎭 --mock 모드: 합성 CHAIN_SUMMARY 로그 생성 중...\n");

  const lines: string[] = [];

  // Group A: hopCount 1, duration 15-35s
  for (let i = 0; i < 36; i++) {
    const d = 15000 + Math.floor(Math.random() * 20000);
    lines.push(`[METRIC] CHAIN_SUMMARY durationMs=${d} hopCount=1 status=COMPLETED agents=developer`);
  }

  // Group B: hopCount 2, duration 40-70s
  for (let i = 0; i < 36; i++) {
    const d = 40000 + Math.floor(Math.random() * 30000);
    lines.push(`[METRIC] CHAIN_SUMMARY durationMs=${d} hopCount=2 status=COMPLETED agents=developer,reviewer`);
  }

  // Group C: hopCount 3, duration 65-100s (일부 SOFT_BUDGET_REACHED 이후 COMPLETED)
  for (let i = 0; i < 30; i++) {
    const d = 65000 + Math.floor(Math.random() * 35000);
    lines.push(`[METRIC] CHAIN_SUMMARY durationMs=${d} hopCount=3 status=COMPLETED agents=developer,reviewer`);
  }

  // Group D: hopCount 3, duration 85-140s, 일부 BUDGET_EXCEEDED
  for (let i = 0; i < 18; i++) {
    const d    = 85000 + Math.floor(Math.random() * 55000);
    const stat = d >= 120000 ? "BUDGET_EXCEEDED" : "COMPLETED";
    lines.push(`[METRIC] CHAIN_SUMMARY durationMs=${d} hopCount=3 status=${stat} agents=developer,reviewer`);
  }

  // 로그 파일에 쓰기
  const content = lines.map(l => `[2026-03-01T00:00:00.000Z] ${l}`).join("\n") + "\n";
  fs.writeFileSync(LOG_FILE, content);
  const chainOnly = LOG_FILE.replace("chain_stress.log", "chain_summary_only.log");
  fs.writeFileSync(chainOnly, lines.join("\n") + "\n");

  console.log(`✅ 합성 로그 생성 완료`);
  console.log(`   - chain_stress.log        (${lines.length}건 타임스탬프 포함)`);
  console.log(`   - chain_summary_only.log  (CHAIN_SUMMARY 순수 라인)`);

  runAnalyzer(chainOnly);
}

// ─── telemetry-analyzer 실행 ─────────────────────────────────────────────────

function runAnalyzer(logFile: string): void {
  const analyzerPath = path.resolve("scripts/telemetry-analyzer.ts");
  const tsxPath      = path.resolve("node_modules/tsx/dist/cli.mjs");

  if (!fs.existsSync(analyzerPath)) {
    console.log("\n⚠️  telemetry-analyzer.ts를 찾을 수 없습니다. 수동으로 실행하세요:");
    console.log(`   node ${tsxPath} ${analyzerPath} ${logFile}`);
    return;
  }

  console.log("\n📊 telemetry-analyzer 실행 중...");
  const result = child_process.spawnSync(
    process.execPath,
    [tsxPath, analyzerPath, logFile],
    { stdio: "inherit" }
  );

  if (result.status !== 0) {
    console.log("⚠️  분석 실패. 수동으로 실행하세요:");
    console.log(`   node node_modules/tsx/dist/cli.mjs scripts/telemetry-analyzer.ts ${logFile}`);
  }
}

// ─── 실제 스트레스 테스트 실행 ────────────────────────────────────────────────

async function runStressTest(): Promise<void> {
  const prog = loadProgress();
  const start = prog.completed; // 이전 실행에서 이어받기

  console.log("\n🔥 CHAIN STRESS TEST 시작");
  console.log(`   총 케이스: ${ALL_CASES.length}회 | 재시작 지점: ${start}번`);
  console.log(`   활성 그룹: ${[...ACTIVE_GROUPS].join(",")} | 서버: http://${HOST}:${PORT}`);
  console.log(`   ⚠️  서버는 반드시 로그 캡처 모드로 실행되어야 합니다.`);
  console.log(`   PowerShell: node start-server.js 2>&1 | Tee-Object chain_stress.log\n`);

  let consecutiveErrors = 0;

  for (let i = start; i < ALL_CASES.length; i++) {
    const tc      = ALL_CASES[i];
    const elapsed = `[${i + 1}/${ALL_CASES.length}]`;
    const label   = `Group ${tc.group} | 시작: ${tc.agent} | 목표: hop${tc.targetHops}`;

    process.stdout.write(`${elapsed} ${label} ... `);

    let result: Awaited<ReturnType<typeof sendChatRequest>> = "error";
    let retries = 0;

    while (retries < 3) {
      result = await sendChatRequest(tc.prompt, tc.agent);

      if (result === "rate-limit") {
        process.stdout.write(`⏳ rate-limit (${RATE_LIMIT_SLEEP / 1000}초 대기) `);
        await sleep(RATE_LIMIT_SLEEP);
        retries++;
        continue;
      }
      break;
    }

    if (result === "done") {
      prog.completed++;
      consecutiveErrors = 0;
      console.log("✅");
    } else {
      prog.failed++;
      consecutiveErrors++;
      console.log(`❌ (${result})`);
    }

    saveProgress(prog);

    // 연속 오류 5회 이상 시 중단
    if (consecutiveErrors >= 5) {
      console.log("\n❌ 연속 오류 5회 발생. 테스트 중단. 서버 상태를 확인하세요.");
      break;
    }

    // 요청 간 딜레이
    if (i < ALL_CASES.length - 1) {
      await sleep(BETWEEN_DELAY_MS);
    }
  }

  // 완료 보고
  console.log("\n─────────────────────────────────────────────────────────");
  console.log(`테스트 완료: ✅ ${prog.completed}회 성공 | ❌ ${prog.failed}회 실패`);
  console.log(`\n다음 명령으로 CHAIN_SUMMARY 라인 추출 후 분석하세요:`);
  console.log(`  Windows: Select-String "CHAIN_SUMMARY" chain_stress.log | % { $_.Line } > chain_summary_only.log`);
  console.log(`  Linux:   grep "CHAIN_SUMMARY" chain_stress.log > chain_summary_only.log`);
  console.log(`  분석:    node node_modules/tsx/dist/cli.mjs scripts/telemetry-analyzer.ts chain_summary_only.log`);

  // 진행 파일 정리
  if (prog.completed === ALL_CASES.length) {
    fs.unlinkSync(PROGRESS_FILE);
  }
}

// ─── 진입점 ───────────────────────────────────────────────────────────────────

if (IS_MOCK) {
  generateMockLogs();
} else {
  runStressTest().catch(err => {
    console.error("치명적 오류:", err);
    process.exit(1);
  });
}
