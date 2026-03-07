// Socket.IO 서버 초기화 및 브로드캐스트 함수
// server.ts에서 HTTP 서버에 바인딩됩니다.

import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import { getProjectBase } from "@/lib/utils/env";
import { checkSocketAuth } from "@/lib/utils/auth";

let io: SocketIOServer | null = null;

// 터미널 세션: socketId → { cwd, process }
const terminalSessions = new Map<string, { cwd: string; proc: ChildProcess | null }>();

/**
 * Socket.IO 서버 초기화
 * HTTP 서버에 바인딩하여 /agents, /terminal 네임스페이스를 생성합니다.
 */
export function initSocketServer(httpServer: HttpServer): void {
  // CORS 설정: ALLOWED_ORIGIN 미설정 시 same-origin만 허용 (wildcard 차단)
  const allowedOrigin = process.env.ALLOWED_ORIGIN;
  const corsConfig = allowedOrigin
    ? { origin: allowedOrigin, methods: ["GET", "POST"], credentials: true }
    : { origin: false as const, methods: ["GET", "POST"], credentials: false };

  io = new SocketIOServer(httpServer, {
    path: "/socket.io",
    cors: corsConfig,
  });

  // ── 전역 인증 미들웨어 (모든 네임스페이스에 자동 적용) ────────────────────────
  io.use((socket, next) => {
    const authToken   = socket.handshake.auth?.token as string | undefined;
    const cookieHdr   = socket.handshake.headers.cookie;
    if (checkSocketAuth(authToken, cookieHdr)) return next();

    console.log(`[SECURITY] SOCKET_AUTH_FAILED id=${socket.id} ip=${socket.handshake.address}`);
    next(new Error("Unauthorized"));
  });

  // ── /agents 네임스페이스 ──────────────────────────────────────────────────────
  const agentsNs = io.of("/agents");
  agentsNs.on("connection", (socket) => {
    console.log(`[Socket.IO] 클라이언트 연결: ${socket.id}`);
    socket.on("disconnect", () => {
      console.log(`[Socket.IO] 클라이언트 연결 해제: ${socket.id}`);
    });
  });

  // ── /terminal 네임스페이스 ───────────────────────────────────────────────────
  // ✅ 보안: /terminal은 bash 실행 권한이 있어 가장 위험 → 네임스페이스 레벨 이중 인증
  const terminalNs  = io.of("/terminal");
  const projectBase = getProjectBase();

  // 전역 io.use() 이후 추가 검증 — 중요 네임스페이스 이중 확인
  terminalNs.use((socket, next) => {
    const authToken = socket.handshake.auth?.token as string | undefined;
    const cookieHdr = socket.handshake.headers.cookie;
    if (checkSocketAuth(authToken, cookieHdr)) return next();

    console.log(`[SECURITY] TERMINAL_AUTH_BLOCKED id=${socket.id} ip=${socket.handshake.address}`);
    next(new Error("Terminal access requires authentication"));
  });

  terminalNs.on("connection", (socket) => {
    const initCwd = projectBase;
    terminalSessions.set(socket.id, { cwd: initCwd, proc: null });

    // 연결 직후 초기 cwd 전송
    socket.emit("terminal:ready", { cwd: initCwd });

    socket.on("terminal:command", ({ command }: { command: string }) => {
      const session = terminalSessions.get(socket.id);
      if (!session) return;

      const trimmed = command.trim();

      // cd 명령 특수 처리
      if (/^cd(\s|$)/.test(trimmed)) {
        const dir        = trimmed.slice(2).trim() || process.env.HOME || "/";
        const targetPath = dir.startsWith("/") ? dir : path.resolve(session.cwd, dir);

        // ✅ 보안: PROJECT_BASE_DIR 외부 디렉터리 이동 차단 (디렉터리 탈출 방지)
        const normalizedTarget = path.normalize(targetPath);
        const normalizedBase   = path.normalize(projectBase);
        if (!normalizedTarget.startsWith(normalizedBase)) {
          socket.emit("terminal:output", {
            data: `\r\n[보안] 프로젝트 디렉터리(${projectBase}) 외부 이동이 차단되었습니다.\r\n`,
          });
          socket.emit("terminal:done", { code: 1, cwd: session.cwd });
          return;
        }

        try {
          require("fs").accessSync(normalizedTarget);
          session.cwd = normalizedTarget;
          terminalSessions.set(socket.id, session);
          socket.emit("terminal:output", { data: "" });
          socket.emit("terminal:done", { code: 0, cwd: normalizedTarget });
        } catch {
          socket.emit("terminal:output", { data: `bash: cd: ${dir}: No such file or directory\n` });
          socket.emit("terminal:done", { code: 1, cwd: session.cwd });
        }
        return;
      }

      // 기존 프로세스 종료
      if (session.proc) {
        try { session.proc.kill(); } catch { /* ignore */ }
      }

      const proc = spawn("bash", ["-c", trimmed], {
        cwd: session.cwd,
        env: { ...process.env, TERM: "xterm-256color", FORCE_COLOR: "1" },
      });

      session.proc = proc;
      terminalSessions.set(socket.id, session);

      proc.stdout.on("data", (data: Buffer) => {
        socket.emit("terminal:output", { data: data.toString() });
      });
      proc.stderr.on("data", (data: Buffer) => {
        socket.emit("terminal:output", { data: data.toString() });
      });
      proc.on("close", (code) => {
        session.proc = null;
        socket.emit("terminal:done", { code: code ?? 0, cwd: session.cwd });
      });
      proc.on("error", (err) => {
        socket.emit("terminal:output", { data: `Error: ${err.message}\n` });
        socket.emit("terminal:done", { code: 1, cwd: session.cwd });
      });
    });

    // Ctrl+C 인터럽트
    socket.on("terminal:interrupt", () => {
      const session = terminalSessions.get(socket.id);
      if (session?.proc) {
        try { session.proc.kill("SIGINT"); } catch { /* ignore */ }
      }
    });

    socket.on("disconnect", () => {
      const session = terminalSessions.get(socket.id);
      if (session?.proc) {
        try { session.proc.kill(); } catch { /* ignore */ }
      }
      terminalSessions.delete(socket.id);
    });
  });

  console.log("[Socket.IO] 서버 초기화 완료 (/agents, /terminal 네임스페이스)");
  console.log(`[Socket.IO] CORS origin: ${process.env.ALLOWED_ORIGIN ?? "*"}`);
  console.log(`[Socket.IO] 인증: ${process.env.DASHBOARD_SECRET ? "활성화" : "비활성화 (로컬 개발)"}`);
}

/**
 * 에이전트 상태 변경을 모든 연결된 클라이언트에 브로드캐스트
 */
export function broadcastAgentStatus(
  agentId: string,
  status: string,
  currentTask?: string
): void {
  if (!io) return;
  io.of("/agents").emit("agent:status-change", {
    agentId, status, currentTask, timestamp: Date.now(),
  });
}

/**
 * 파일 변경 이벤트 브로드캐스트
 */
export function broadcastFileChanged(
  agentId: string,
  filePath: string,
  action: "create" | "modify" | "delete"
): void {
  if (!io) return;
  io.of("/agents").emit("file:changed", {
    agentId, path: filePath, action, timestamp: Date.now(),
  });
}

/**
 * 토큰 사용량 이벤트 브로드캐스트
 */
export function broadcastTokenUsage(
  agentId: string,
  inputTokens: number,
  outputTokens: number,
  totalCost: number
): void {
  if (!io) return;
  io.of("/agents").emit("agent:token-usage", {
    agentId, inputTokens, outputTokens, totalCost, timestamp: Date.now(),
  });
}
