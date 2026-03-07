import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fsp } from "fs";
import path from "path";
import {
  listCustomAgents,
  createCustomAgent,
} from "@/lib/custom-agent-store";

const TEST_DIR = path.join(process.cwd(), "data", "custom-agents");

const validInput = {
  id: "api-tester",
  name: "API 테스터",
  icon: "🔌",
  color: "#6366F1",
  description: "API 통합 테스트 전문가",
  model: "sonnet" as const,
  systemPrompt: "당신은 API 테스트 전문가입니다. 엔드포인트를 검증하세요.",
};

beforeEach(async () => {
  await fsp.mkdir(TEST_DIR, { recursive: true });
  try {
    const files = await fsp.readdir(TEST_DIR);
    for (const f of files) {
      if (f.endsWith(".json")) await fsp.unlink(path.join(TEST_DIR, f));
    }
  } catch { /* ignore */ }
});

afterEach(async () => {
  try {
    const files = await fsp.readdir(TEST_DIR);
    for (const f of files) {
      if (f.endsWith(".json")) await fsp.unlink(path.join(TEST_DIR, f));
    }
  } catch { /* ignore */ }
});

describe("Custom Agents Store (API 레벨)", () => {
  it("빈 디렉터리에서 GET → 빈 배열", async () => {
    const agents = await listCustomAgents();
    expect(agents).toEqual([]);
  });

  it("POST 유효 → 생성 + id 반환", async () => {
    const agent = await createCustomAgent(validInput);
    expect(agent.id).toBe("api-tester");
    expect(agent.name).toBe("API 테스터");
    expect(agent.createdAt).toBeDefined();
  });

  it("POST 중복 ID → 에러", async () => {
    await createCustomAgent(validInput);
    await expect(createCustomAgent(validInput)).rejects.toThrow("이미 존재하는 에이전트 ID");
  });

  it("생성 후 list → 1개 반환", async () => {
    await createCustomAgent(validInput);
    const agents = await listCustomAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe("api-tester");
  });
});
