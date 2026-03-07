import { describe, it, expect } from "vitest";
import {
  createCustomAgentSchema,
  updateCustomAgentSchema,
  BUILTIN_AGENT_IDS,
} from "../agents";

describe("createCustomAgentSchema", () => {
  const validInput = {
    id: "qa-tester",
    name: "QA 테스터",
    icon: "🧪",
    color: "#10B981",
    description: "자동화 테스트 전문가",
    model: "sonnet",
    systemPrompt: "당신은 QA 엔지니어입니다. 테스트 코드를 작성하세요.",
  };

  it("유효한 입력을 통과시킨다", () => {
    const result = createCustomAgentSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("대문자/공백 ID를 거부한다", () => {
    const result = createCustomAgentSchema.safeParse({
      ...validInput,
      id: "QA Tester",
    });
    expect(result.success).toBe(false);
  });

  it("color에 # 없으면 거부한다", () => {
    const result = createCustomAgentSchema.safeParse({
      ...validInput,
      color: "10B981",
    });
    expect(result.success).toBe(false);
  });

  it("systemPrompt 10자 미만을 거부한다", () => {
    const result = createCustomAgentSchema.safeParse({
      ...validInput,
      systemPrompt: "짧다",
    });
    expect(result.success).toBe(false);
  });

  it("model enum 외 값을 거부한다", () => {
    const result = createCustomAgentSchema.safeParse({
      ...validInput,
      model: "gpt-4",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateCustomAgentSchema", () => {
  it("부분 업데이트를 허용한다", () => {
    const result = updateCustomAgentSchema.safeParse({ name: "새 이름" });
    expect(result.success).toBe(true);
  });
});

describe("BUILTIN_AGENT_IDS", () => {
  it("내장 에이전트 7개를 포함한다", () => {
    expect(BUILTIN_AGENT_IDS).toHaveLength(7);
    expect(BUILTIN_AGENT_IDS).toContain("developer");
    expect(BUILTIN_AGENT_IDS).toContain("planner");
  });
});
