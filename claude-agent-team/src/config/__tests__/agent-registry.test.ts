import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fsp } from "fs";
import path from "path";

// 테스트 전에 모듈을 동적 import (캐시 무효화 위해)
const TEST_DIR = path.join(process.cwd(), "data", "custom-agents");

const mockCustomAgent = {
  id: "qa-tester",
  name: "QA 테스터",
  icon: "🧪",
  color: "#10B981",
  description: "자동화 테스트 전문가",
  model: "sonnet",
  systemPrompt: "당신은 QA 엔지니어입니다. 테스트를 작성하세요.",
  createdAt: "2026-03-03T00:00:00Z",
  updatedAt: "2026-03-03T00:00:00Z",
};

beforeEach(async () => {
  await fsp.mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  try {
    const files = await fsp.readdir(TEST_DIR);
    for (const f of files) {
      if (f.endsWith(".json")) await fsp.unlink(path.join(TEST_DIR, f));
    }
  } catch { /* ignore */ }
});

describe("agent-registry", () => {
  it("내장 에이전트 config를 반환한다", async () => {
    const { getAgentConfig } = await import("../agent-registry");
    const config = await getAgentConfig("developer");
    expect(config).not.toBeNull();
    expect(config?.id).toBe("developer");
    expect(config?.name).toBe("개발자");
  });

  it("커스텀 에이전트 config를 반환한다", async () => {
    await fsp.writeFile(
      path.join(TEST_DIR, "qa-tester.json"),
      JSON.stringify(mockCustomAgent),
    );

    const { getAgentConfig, refreshCustomAgentCache } = await import("../agent-registry");
    await refreshCustomAgentCache();
    const config = await getAgentConfig("qa-tester");

    expect(config).not.toBeNull();
    expect(config?.id).toBe("qa-tester");
    expect(config?.name).toBe("QA 테스터");
  });

  it("미존재 에이전트 → null 반환", async () => {
    const { getAgentConfig } = await import("../agent-registry");
    const config = await getAgentConfig("nonexistent-agent");
    expect(config).toBeNull();
  });

  it("내장 시스템 프롬프트를 반환한다", async () => {
    const { getAgentSystemPrompt } = await import("../agent-registry");
    const prompt = await getAgentSystemPrompt("developer");
    expect(prompt).toContain("코드");
  });

  it("커스텀 시스템 프롬프트를 반환한다", async () => {
    await fsp.writeFile(
      path.join(TEST_DIR, "qa-tester.json"),
      JSON.stringify(mockCustomAgent),
    );

    const { getAgentSystemPrompt, refreshCustomAgentCache } = await import("../agent-registry");
    await refreshCustomAgentCache();
    const prompt = await getAgentSystemPrompt("qa-tester");
    expect(prompt).toContain("QA 엔지니어");
  });

  it("getAllAgentConfigs → 내장 + 커스텀 머지 리스트", async () => {
    await fsp.writeFile(
      path.join(TEST_DIR, "qa-tester.json"),
      JSON.stringify(mockCustomAgent),
    );

    const { getAllAgentConfigs, refreshCustomAgentCache } = await import("../agent-registry");
    await refreshCustomAgentCache();
    const all = await getAllAgentConfigs();

    // 내장 7 + 커스텀 1 = 8 이상
    expect(all.length).toBeGreaterThanOrEqual(8);
    expect(all.find((a) => a.id === "qa-tester")).toBeDefined();
    expect(all.find((a) => a.id === "developer")).toBeDefined();
  });
});
