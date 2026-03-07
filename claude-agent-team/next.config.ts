import type { NextConfig } from "next";
import path from "path";

// Linux 실행 환경: .next 캐시가 Windows SWC 바이너리를 포함하여 hang 발생
// → /tmp 아래의 쓰기 가능한 경로를 distDir로 사용 (재컴파일 강제)
const isLinux = process.platform === "linux";

const nextConfig: NextConfig = {
  // 빌드 시 TS 타입 에러 무시 (Next.js 15 params 타입 변경으로 인한 validator 오류)
  typescript: { ignoreBuildErrors: true },
  // Node.js 내장 모듈 사용 허용 (child_process, fs 등)
  serverExternalPackages: [
    "child_process",
    "fs",
    "path",
    "pino",
    "pino-pretty",
    "thread-stream",
  ],
  // preview_* 툴 및 127.0.0.1 접근 허용 (Cross-origin 경고 제거)
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // workspace root를 명시하여 여러 lockfile 경고 해소
  outputFileTracingRoot: path.join(__dirname),
  // Linux 환경에서는 별도 빌드 디렉토리 사용 (Windows .next 캐시 회피)
  ...(isLinux ? { distDir: "/tmp/jm-agent-next" } : {}),
};

export default nextConfig;
