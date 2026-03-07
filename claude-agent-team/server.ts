// Next.js 커스텀 HTTP 서버 + Socket.IO 통합 진입점
// 표준 `next start` 대신 이 파일로 서버를 실행하면 WebSocket이 활성화됩니다.

import { createServer, IncomingMessage } from "http";
import { request as httpsRequest }        from "https";
import { spawn }                          from "child_process";
import { writeFileSync }                  from "fs";
import { join }                           from "path";
import type { UrlWithParsedQuery }        from "url";
import { parse as parseQuery }            from "querystring";
import next                               from "next";
import { initSocketServer }               from "./src/lib/socket-server";
import { checkHttpAuth }                  from "./src/lib/utils/auth";
import { findTenantByApiKey }             from "./src/lib/tenant/tenant-store";
import { startTempCleaner, stopTempCleaner } from "./src/lib/temp-cleaner";

// ─── 부팅 시 필수 ENV 검증 ────────────────────────────────────────────────────
// 잘못된 설정으로 서버가 뜨는 것을 방지 — 빠른 실패(fail-fast) 원칙
function validateEnv(): void {
  const mode = process.env.CLAUDE_CODE_MODE ?? "sdk";

  // api 모드에서는 ANTHROPIC_API_KEY 필수
  if (mode === "api" && !process.env.ANTHROPIC_API_KEY) {
    console.error("[ENV] ANTHROPIC_API_KEY is required when CLAUDE_CODE_MODE=api");
    process.exit(1);
  }

  // 포트 유효성 검사 (1~65535)
  const portNum = Number(process.env.PORT ?? "3000");
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    console.error(`[ENV] Invalid PORT: ${process.env.PORT}`);
    process.exit(1);
  }

  // ✅ 보안: production 환경에서 DASHBOARD_SECRET 미설정 시 시작 거부
  if (process.env.NODE_ENV === "production" && !process.env.DASHBOARD_SECRET) {
    console.error("[ENV] DASHBOARD_SECRET is required in production mode");
    console.error("[ENV] 예시: DASHBOARD_SECRET=강력한_랜덤_문자열_32자 이상 권장");
    process.exit(1);
  }

  // ── dotenv 중복 진단용 로그 (서버 시작 시 정확히 1회만 출력돼야 함) ──────────
  // 2회 이상 출력되면 validateEnv()가 중복 호출되는 것이므로 코드를 확인하세요.
  const nodeEnv   = process.env.NODE_ENV ?? "development";
  const envSource = nodeEnv === "production" ? ".env.production" : ".env.local";
  console.log(`[ENV] NODE_ENV=${nodeEnv} SOURCE=${envSource}`);
  console.log(`[ENV] mode=${mode} port=${portNum} ✓`);
  if (process.env.DASHBOARD_SECRET) {
    console.log("[ENV] DASHBOARD_SECRET 설정됨 — 인증 활성화");
  } else {
    console.log("[ENV] DASHBOARD_SECRET 미설정 — 인증 비활성화 (로컬 개발 모드)");
  }
}

// ─── Rate Limiter (메모리 기반, npm 패키지 불필요) ─────────────────────────────
// IP당 분당 30회 제한. Cloudflare 환경에서 cf-connecting-ip 우선 사용.

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

// 만료된 항목 주기적 정리 (5분마다) — 메모리 누수 방지
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now >= entry.resetAt) rateLimitMap.delete(ip);
  }
}, 5 * 60_000).unref(); // unref(): 이 타이머가 프로세스 종료를 막지 않도록 설정

function getClientIp(req: IncomingMessage): string {
  // Cloudflare Tunnel: cf-connecting-ip 헤더에 실제 클라이언트 IP
  const cfIp = req.headers["cf-connecting-ip"];
  if (typeof cfIp === "string" && cfIp) return cfIp;
  // 일반 프록시: X-Forwarded-For
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

function checkRateLimit(ip: string): boolean {
  // localhost는 rate limit 제외 — 내부 컴포넌트 폴링(/api/agents 등)이 차단되지 않도록
  if (ip === "::1" || ip === "127.0.0.1" || ip === "localhost") return true;

  const LIMIT     = 30;
  const WINDOW_MS = 60_000; // 1분
  const now       = Date.now();
  const entry     = rateLimitMap.get(ip);

  // 만료된 항목이면 카운터 초기화 (lazy cleanup)
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= LIMIT) return false;
  rateLimitMap.set(ip, { ...entry, count: entry.count + 1 });
  return true;
}

// 인증 없이 통과 가능한 경로 (정적 에셋, 로그인 엔드포인트)
function isPublicPath(url: string): boolean {
  return (
    url.startsWith("/_next/") ||     // Next.js 정적 에셋
    url.startsWith("/favicon") ||    // 파비콘
    url === "/login" ||              // 로그인 페이지
    url.startsWith("/login?") ||
    url === "/api/auth" ||           // 로그인 API 자체는 공개
    url.startsWith("/api/auth?") ||
    url === "/api/auth/mode" ||      // 인증 모드 감지 (로그인 페이지용)
    url === "/api/health" ||          // 헬스 체크 (liveness probe)
    url.startsWith("/api/tenants")    // 테넌트 관리 (DASHBOARD_SECRET 인증은 라우트에서 직접 처리)
  );
}

/**
 * url.parse() 대체 — Node.js 24 DeprecationWarning [DEP0169] 방지
 * Next.js RequestHandler가 요구하는 UrlWithParsedQuery 형태로 변환합니다.
 * 주방장(Next.js)이 원하는 레시피 카드 양식(UrlWithParsedQuery)에 맞춰 재료를 정리하는 것.
 */
function parseUrlSafe(rawUrl: string): UrlWithParsedQuery {
  const parsed = new URL(rawUrl, "http://n"); // 더미 베이스 — pathname/search만 사용
  return {
    protocol: null,
    slashes: null,
    auth: null,
    host: null,
    port: null,
    hostname: null,
    hash: parsed.hash || null,
    search: parsed.search || null,
    query: parseQuery(parsed.searchParams.toString()),
    pathname: parsed.pathname,
    path: parsed.pathname + (parsed.search || ""),
    href: rawUrl,
  };
}

// ─── Graceful Shutdown ──────────────────────────────────────────────────────
// 비행기의 정상 착륙 절차: 승객(연결) 안전 → 엔진(서버) 정지 → 전원 차단
let httpServerRef: ReturnType<typeof createServer> | null = null;
let shuttingDown = false;

function gracefulShutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[SHUTDOWN] ${signal} received — graceful shutdown starting...`);

  stopTempCleaner();
  console.log("[SHUTDOWN] Temp cleaner stopped");

  if (httpServerRef) {
    httpServerRef.close(() => {
      console.log("[SHUTDOWN] HTTP server closed");
      process.exit(0);
    });
  }

  // 10초 타임아웃 안전장치 (연결이 닫히지 않을 때 강제 종료)
  setTimeout(() => {
    console.error("[SHUTDOWN] Forced exit after 10s timeout");
    process.exit(1);
  }, 10_000).unref();
}

// ─── 부팅 타이밍 ────────────────────────────────────────────────────────────
const SERVER_BOOT_TIME = Date.now();

// ─── 터널 중복 실행 방지 플래그 ────────────────────────────────────────────────
let tunnelStarted = false;

// ─── URL 파일 저장 ────────────────────────────────────────────────────────────
// 프로젝트 루트에 current-url.txt 생성 (서버 재시작 시 자동 갱신)
function saveTunnelUrl(url: string): void {
  const filePath = join(process.cwd(), "current-url.txt");
  const content  = [
    `PUBLIC_URL=${url}`,
    `TIMESTAMP=${new Date().toISOString()}`,
    "",
  ].join("\n");
  try {
    writeFileSync(filePath, content, "utf-8");
    console.log(`[TUNNEL] URL 파일 저장됨: current-url.txt`);
  } catch (err) {
    console.error("[TUNNEL] URL 파일 저장 실패:", (err as Error).message);
  }
}

// ─── Telegram 알림 (선택) ────────────────────────────────────────────────────
// TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID 환경변수 설정 시에만 동작
// 미설정 시 조용히 무시 — 필수 기능이 아님
function sendTelegramNotification(url: string): void {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId   = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;

  const text = [
    "🤖 JM Agent Team 대시보드",
    `🔗 새 터널 URL: ${url}`,
    `🕒 ${new Date().toLocaleString("ko-KR")}`,
  ].join("\n");
  const body    = JSON.stringify({ chat_id: chatId, text });
  const options = {
    hostname: "api.telegram.org",
    path:     `/bot${botToken}/sendMessage`,
    method:   "POST",
    headers:  {
      "Content-Type":   "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  };

  const req = httpsRequest(options, (res) => {
    if (res.statusCode === 200) {
      console.log("[TUNNEL] Telegram 알림 전송 완료 ✓");
    } else {
      console.error(`[TUNNEL] Telegram 전송 실패 (HTTP ${res.statusCode})`);
    }
  });
  req.on("error", (err: Error) => console.error("[TUNNEL] Telegram 요청 오류:", err.message));
  req.write(body);
  req.end();
}

// ─── Cloudflare Quick Tunnel 시작 ─────────────────────────────────────────────
// 조건: ENABLE_REMOTE_ACCESS=true + NODE_ENV=production (호출부에서 검증)
function startCloudflaredTunnel(port: number): void {
  // ── 중복 실행 방지 ──────────────────────────────────────────────────────────
  if (tunnelStarted) {
    console.log("[TUNNEL] 이미 실행 중입니다. 중복 실행 무시.");
    return;
  }
  tunnelStarted = true;
  console.log("[TUNNEL] Cloudflare Quick Tunnel 시작 중...");

  // cloudflared 실행 경로: 환경변수 > Windows 기본 설치 경로 > PATH 검색
  // PM2 환경에서 spawn()이 PATH를 잘못 해석할 수 있어 절대 경로 우선 사용
  const cfPath = process.env.CLOUDFLARED_PATH
    || (process.platform === "win32"
        ? "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe"
        : "cloudflared");

  // cloudflared 환경변수 정리: TUNNEL_NAME 등이 설정되어 있으면
  // Named Tunnel 모드로 실행되어 원본 인증서(cert.pem)를 요구함 → 제거
  const { TUNNEL_NAME, TUNNEL_ORIGIN_CERT, TUNNEL_ID, ...cleanEnv } = process.env as Record<string, string | undefined>;
  void TUNNEL_NAME; void TUNNEL_ORIGIN_CERT; void TUNNEL_ID; // 미사용 변수 경고 억제

  const tunnelProc = spawn(
    cfPath,
    ["tunnel", "--url", `http://localhost:${port}`],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: cleanEnv,  // TUNNEL_NAME 제거한 환경으로 실행
    }
  );

  // ── URL 최초 감지 + 전체 출력 로깅 ─────────────────────────────────────────
  // cloudflared는 터널 URL을 주로 stderr에 출력하지만 버전에 따라 stdout도 사용
  // PM2 디버깅을 위해 오류 줄은 모두 로깅
  let urlDetected = false;
  const handleOutput = (data: Buffer) => {
    const text  = data.toString();
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match && !urlDetected) {
      urlDetected = true;
      const detectedUrl = match[0];
      console.log(`\n${"=".repeat(64)}`);
      console.log(` [TUNNEL] Public URL: ${detectedUrl}`);
      console.log(` [TUNNEL] HTTPS TLS auto-applied (Cloudflare)`);
      console.log(` [TUNNEL] ALLOWED_ORIGIN update recommended: ${detectedUrl}`);
      console.log(`${"=".repeat(64)}\n`);
      // URL 파일 저장 (current-url.txt)
      saveTunnelUrl(detectedUrl);
      // Telegram 알림 (선택 — 환경변수 미설정 시 무시)
      sendTelegramNotification(detectedUrl);
    }
    // 오류 줄은 PM2 로그에 출력 (디버깅)
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && (trimmed.includes("ERR") || trimmed.includes("error") || trimmed.includes("failed"))) {
        console.error(`[TUNNEL] cloudflared: ${trimmed}`);
      }
    }
  };
  tunnelProc.stdout.on("data", handleOutput);
  tunnelProc.stderr.on("data", handleOutput);

  tunnelProc.on("error", (err: Error) => {
    tunnelStarted = false; // 오류 시 플래그 초기화 → 재시도 허용
    console.error("[TUNNEL] cloudflared 실행 실패:", err.message);
    console.error("[TUNNEL] 설치 방법: winget install cloudflare.cloudflared");
    console.error("[TUNNEL] 또는: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/");
  });

  tunnelProc.on("exit", (code) => {
    tunnelStarted = false; // 정상/비정상 종료 후 플래그 초기화 → 재시도 허용
    if (code !== null && code !== 0) {
      console.error(`[TUNNEL] cloudflared 종료 (code=${code})`);
    }
  });

  // ── 서버 종료 시 터널 프로세스 정리 ─────────────────────────────────────────
  // SIGINT/SIGTERM은 gracefulShutdown()이 처리 → exit 이벤트에서 터널 정리
  process.on("exit", () => { try { tunnelProc.kill(); } catch { /* ignore */ } });
}

// ─── 서버 부팅 ────────────────────────────────────────────────────────────────

// 서버 시작 전 ENV 검증 실행
validateEnv();

// 개발/프로덕션 환경 판별
const dev  = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);

// Next.js 앱 인스턴스 생성
const app    = next({ dev });
const handle = app.getRequestHandler();

// Next.js 준비 완료 후 HTTP 서버 시작
app
  .prepare()
  .then(() => {
    // HTTP 서버 생성 — Rate Limit + Auth 체크 후 Next.js에 위임
    const httpServer = createServer(async (req, res) => {
      const url = req.url ?? "/";
      const ip  = getClientIp(req);

      // ── [1] Rate Limiting ─────────────────────────────────────────────────
      if (!checkRateLimit(ip)) {
        console.log(`[SECURITY] RATE_LIMIT_EXCEEDED ip=${ip} url=${url}`);
        res.writeHead(429, {
          "Content-Type": "application/json",
          "Retry-After":  "60",
        });
        res.end(JSON.stringify({ error: "Too Many Requests. 1분 후 다시 시도하세요." }));
        return;
      }

      // ── [2] Auth Check ────────────────────────────────────────────────────
      if (!isPublicPath(url) && !checkHttpAuth(req.headers.authorization, req.headers.cookie)) {
        // API 요청 → 401 JSON
        if (url.startsWith("/api/")) {
          console.log(`[SECURITY] AUTH_FAILED ip=${ip} url=${url}`);
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unauthorized. 올바른 접속 토큰이 필요합니다." }));
          return;
        }
        // 페이지 요청 → 로그인 페이지로 리다이렉트
        res.writeHead(302, { Location: "/login" });
        res.end();
        return;
      }

      // ── [3] 멀티 테넌트: API 키 / 쿠키 → tenantId 주입 ────────────────
      if (process.env.MULTI_TENANT_MODE === "true" && !isPublicPath(url)) {
        const apiKey = req.headers["x-api-key"] as string | undefined;
        if (apiKey) {
          const tenant = await findTenantByApiKey(apiKey);
          if (!tenant || !tenant.active) {
            console.log(`[SECURITY] TENANT_AUTH_FAILED ip=${ip} url=${url}`);
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid or inactive API key" }));
            return;
          }
          // 하위 API 라우트에서 x-tenant-id 헤더로 tenantId를 읽을 수 있도록 주입
          (req.headers as Record<string, string | string[] | undefined>)["x-tenant-id"] = tenant.id;
        }

        // x-api-key가 없으면 jm_tenant 쿠키에서 tenantId 추출 (브라우저 세션)
        if (!req.headers["x-tenant-id"]) {
          const cookieHeader = req.headers.cookie ?? "";
          const tenantMatch = cookieHeader.match(/(?:^|;\s*)jm_tenant=([^;]+)/);
          if (tenantMatch) {
            (req.headers as Record<string, string | string[] | undefined>)["x-tenant-id"] = tenantMatch[1];
          }
        }
      }

      const parsedUrl = parseUrlSafe(url);
      handle(req, res, parsedUrl);
    });

    // Socket.IO 서버 초기화 (HTTP 서버에 바인딩)
    initSocketServer(httpServer);

    // 지정된 포트에서 HTTP 서버 시작
    httpServer.listen(port, () => {
      const elapsed = ((Date.now() - SERVER_BOOT_TIME) / 1000).toFixed(1);
      console.log(`> Ready on http://localhost:${port} (${elapsed}s)`);
      console.log(`> Socket.IO 실시간 기능 활성화됨`);
      console.log(`> Rate Limit: 30회/분/IP`);

      // Graceful shutdown 등록
      httpServerRef = httpServer;
      process.on("SIGINT",  () => gracefulShutdown("SIGINT"));
      process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

      // 임시 파일 자동 정리 시작 (30분 이상 된 파일 삭제, 5분 간격 실행)
      startTempCleaner();

      // 자가 헬스 체크 — 서버가 실제로 응답하는지 2초 후 검증
      setTimeout(async () => {
        try {
          const res = await fetch(`http://localhost:${port}/api/health`);
          if (res.ok) {
            const data = await res.json() as { responseTime?: string };
            console.log(`[HEALTH] Self-check passed (${data.responseTime ?? "ok"})`);
          } else {
            console.error(`[HEALTH] Self-check failed: HTTP ${res.status}`);
          }
        } catch (err) {
          console.error(`[HEALTH] Self-check error: ${(err as Error).message}`);
        }
      }, 2000);

      // Cloudflare Quick Tunnel 시작 조건:
      //   ENABLE_REMOTE_ACCESS=true  + NODE_ENV=production 동시 충족 시에만 실행
      //   개발 환경(NODE_ENV=development)에서는 의도적으로 실행하지 않음
      if (process.env.ENABLE_REMOTE_ACCESS === "true") {
        if (process.env.NODE_ENV === "production") {
          startCloudflaredTunnel(port);
        } else {
          console.log("[TUNNEL] 비활성화 — production 모드가 아닙니다 (NODE_ENV=development)");
          console.log("[TUNNEL] PM2로 실행하거나 NODE_ENV=production 설정 후 재시작하세요.");
        }
      }
    });
  })
  .catch((err: unknown) => {
    // Next.js 앱 초기화 실패 시 즉시 종료
    console.error("[SERVER] Failed to start Next.js app", err);
    process.exit(1);
  });
