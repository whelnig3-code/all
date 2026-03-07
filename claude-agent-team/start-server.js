/**
 * start-server.js — JM Agent Team 서버 진입점
 *
 * preview_start 도구는 node 직접 실행만 지원합니다.
 * 이 파일은 tsx CLI를 통해 server.ts를 실행하는 래퍼입니다.
 */

const { spawn } = require("child_process");
const path = require("path");

// tsx CLI ESM 파일 경로 (node 직접 실행, .cmd 우회)
// Windows에서 .cmd 래퍼는 shell:true 없이 spawn 불가 → cli.mjs 직접 사용
const tsxCliMjs = path.join(__dirname, "node_modules", "tsx", "dist", "cli.mjs");

console.log("[start-server] JM Agent Team 서버 시작 중...");

// tsx cli.mjs를 직접 실행 (Windows .cmd 우회, shell 없이 동작)
const proc = spawn(process.execPath, [tsxCliMjs, "server.ts"], {
  cwd: __dirname,
  stdio: "inherit",
  env: { ...process.env },
});

proc.on("error", (err) => {
  if (err.code === "ENOENT") {
    console.error("[start-server] tsx를 찾을 수 없습니다.");
    console.error("[start-server] npm install 후 다시 시도하세요.");
  } else {
    console.error("[start-server] 서버 시작 실패:", err.message);
  }
  process.exit(1);
});

proc.on("close", (code) => {
  if (code !== 0) {
    console.error("[start-server] 서버가 종료됐습니다 (exit code:", code, ")");
  }
  process.exit(code ?? 0);
});

// Ctrl+C 전달
process.on("SIGINT", () => {
  proc.kill("SIGINT");
});
process.on("SIGTERM", () => {
  proc.kill("SIGTERM");
});
