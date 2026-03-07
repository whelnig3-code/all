import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fsp } from "fs";
import path from "path";
import {
  listCustomAgents,
  getCustomAgent,
  createCustomAgent,
  updateCustomAgent,
  deleteCustomAgent,
} from "../custom-agent-store";

// 테스트용 임시 디렉터리
const TEST_DIR = path.join(process.cwd(), "data", "custom-agents");

const validInput = {
  id: "qa-tester",
  name: "QA 테스터",
  icon: "🧪",
  color: "#10B981",
  description: "자동화 테스트 전문가",
  model: "sonnet",
  systemPrompt: "당신은 QA 엔지니어입니다. 테스트를 작성하세요.",
};

beforeEach(async () => {
  // 테스트 전 디렉터리 정리
  try {
    const files = await fsp.readdir(TEST_DIR);
    for (const f of files) {
      if (f.endsWith(".json")) {
        await fsp.unlink(path.join(TEST_DIR, f));
      }
    }
  } catch { /* dir not exist yet */ }
});

afterEach(async () => {
  // 테스트 후 정리
  try {
    const files = await fsp.readdir(TEST_DIR);
    for (const f of files) {
      if (f.endsWith(".json")) {
        await fsp.unlink(path.join(TEST_DIR, f));
      }
    }
  } catch { /* ignore */ }
});

describe("custom-agent-store", () => {
  it("create → 파일 생성 + 반환", async () => {
    const result = await createCustomAgent(validInput);

    expect(result.id).toBe("qa-tester");
    expect(result.name).toBe("QA 테스터");
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();

    // 파일이 실제로 존재하는지 확인
    const filePath = path.join(TEST_DIR, "qa-tester.json");
    const exists = await fsp.access(filePath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it("duplicate ID → 에러", async () => {
    await createCustomAgent(validInput);
    await expect(createCustomAgent(validInput)).rejects.toThrow();
  });

  it("built-in ID → 에러", async () => {
    await expect(
      createCustomAgent({ ...validInput, id: "developer" }),
    ).rejects.toThrow();
  });

  it("invalid kebab-case → 에러", async () => {
    await expect(
      createCustomAgent({ ...validInput, id: "QA Tester" }),
    ).rejects.toThrow();
  });

  it("list → 모든 커스텀 에이전트 반환", async () => {
    await createCustomAgent(validInput);
    await createCustomAgent({ ...validInput, id: "devops-eng", name: "DevOps" });

    const agents = await listCustomAgents();
    expect(agents).toHaveLength(2);
    expect(agents.map((a) => a.id).sort()).toEqual(["devops-eng", "qa-tester"]);
  });

  it("update → immutable 업데이트", async () => {
    const original = await createCustomAgent(validInput);
    const updated = await updateCustomAgent("qa-tester", { name: "QA 마스터" });

    expect(updated.name).toBe("QA 마스터");
    expect(updated.icon).toBe(original.icon); // 변경하지 않은 필드 유지
    expect(updated.id).toBe(original.id);
  });

  it("delete → 파일 삭제", async () => {
    await createCustomAgent(validInput);
    await deleteCustomAgent("qa-tester");

    const agents = await listCustomAgents();
    expect(agents).toHaveLength(0);
  });

  it("get 미존재 → null", async () => {
    const result = await getCustomAgent("nonexistent");
    expect(result).toBeNull();
  });
});
