import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeTool } from "../tools";

// PROJECT_BASE_DIR 고정하여 테스트 예측 가능하게
const TEST_BASE = process.platform === "win32" ? "C:\\project" : "/project";

describe("executeTool — path traversal 차단", () => {
  beforeEach(() => {
    vi.stubEnv("PROJECT_BASE_DIR", TEST_BASE);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("read_file: 절대 경로로 base 외부 접근 시 에러 반환", async () => {
    const result = await executeTool("read_file", {
      path: process.platform === "win32" ? "C:\\Windows\\System32\\config" : "/etc/passwd",
    });
    expect(result).toContain("도구 실행 오류");
  });

  it("write_file: base 외부 경로 접근 시 에러 반환", async () => {
    const result = await executeTool("write_file", {
      path: "../../etc/evil.txt",
      content: "malicious",
    });
    expect(result).toContain("도구 실행 오류");
  });

  it("list_files: ../../ traversal 시 에러 반환", async () => {
    const result = await executeTool("list_files", {
      path: "../../",
    });
    expect(result).toContain("도구 실행 오류");
  });

  it("read_file: base 내부 상대 경로는 정상 처리 (파일 없으면 에러)", async () => {
    // 존재하지 않는 파일이지만 traversal 에러가 아닌 파일 없음 에러
    const result = await executeTool("read_file", {
      path: "src/nonexistent.ts",
    });
    // traversal 차단 에러가 아닌 일반 파일 오류
    expect(result).toContain("도구 실행 오류");
    expect(result).not.toContain("outside allowed");
  });
});
