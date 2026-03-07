import { describe, it, expect } from "vitest";

/**
 * conversation ID 검증 순수 함수 테스트
 *
 * UUID v4 형식만 허용. path traversal 문자(`../`, `..\\`)를 포함한 ID는 차단.
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidConversationId(id: string): boolean {
  return UUID_REGEX.test(id);
}

describe("Conversation ID validation", () => {
  it("rejects path traversal: ../evil", () => {
    expect(isValidConversationId("../evil")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidConversationId("")).toBe(false);
  });

  it("accepts valid UUID v4", () => {
    expect(isValidConversationId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("rejects non-UUID string", () => {
    expect(isValidConversationId("not-a-uuid")).toBe(false);
  });

  it("rejects UUID-like string with traversal suffix", () => {
    expect(isValidConversationId("550e8400-e29b-41d4-a716-446655440000/../evil")).toBe(false);
  });
});
