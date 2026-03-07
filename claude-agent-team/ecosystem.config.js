// PM2 배포 설정 — `pm2 start ecosystem.config.js` 로 실행

// ── .env.local 수동 파싱 (npm 패키지 의존 없이) ──────────────────────────────
// PM2 env_file은 .env.production만 로드하므로, 머신별 시크릿(.env.local)을
// 이 파일에서 직접 읽어 env 블록에 주입합니다.
const fs   = require("fs");
const path = require("path");

function parseEnvFile(filepath) {
  try {
    return fs.readFileSync(filepath, "utf-8")
      .split("\n")
      .reduce((acc, line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return acc;
        const idx = trimmed.indexOf("=");
        if (idx < 1) return acc;
        acc[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
        return acc;
      }, {});
  } catch (_) {
    return {};
  }
}

// .env.local (머신별 시크릿) → .env.production (운영 기본값) 순서로 로드
// .env.local 값이 우선 (override)
const local = parseEnvFile(path.join(__dirname, ".env.local"));
const prod  = parseEnvFile(path.join(__dirname, ".env.production"));
const env   = { ...prod, ...local }; // local이 prod를 덮어씀

module.exports = {
  apps: [
    {
      name: "jm-agent-team",
      script: "start-server.js",
      cwd: __dirname,

      // ── 재시작 정책 ─────────────────────────────────────────────────────
      watch: false,
      windowsHide: true,       // suppress black console flash on Windows
      max_memory_restart: "512M",
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: "10s",

      // ── 환경변수 ─────────────────────────────────────────────────────────
      // env_file 제거 — 위에서 직접 파싱해 env 블록에 주입
      env: {
        ...env,
        NODE_ENV: "production",          // 항상 production 강제
        PORT: env.PORT || "3000",
        // cloudflared PATH 명시 (PM2는 사용자 PATH를 상속하지 않을 수 있음)
        PATH: (process.env.PATH || "") + ";C:\\Program Files (x86)\\cloudflared",
      },

      // ── 로그 ─────────────────────────────────────────────────────────────
      log_file: "./logs/combined.log",
      out_file: "./logs/out.log",
      error_file: "./logs/error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
    },
  ],
};
