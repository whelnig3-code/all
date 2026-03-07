import { describe, it, expect } from "vitest";

describe("exportConversationToMarkdown", () => {
  it("formats user messages correctly", async () => {
    const { exportConversationToMarkdown } = await import("../export");
    const result = exportConversationToMarkdown({
      title: "Test Chat",
      messages: [
        { role: "user", content: "Hello, how are you?" },
      ],
    });
    expect(result).toContain("# Test Chat");
    expect(result).toContain("**User**");
    expect(result).toContain("Hello, how are you?");
  });

  it("formats assistant messages with agent name", async () => {
    const { exportConversationToMarkdown } = await import("../export");
    const result = exportConversationToMarkdown({
      title: "Chat",
      messages: [
        { role: "assistant", content: "I can help!", agentId: "developer" },
      ],
    });
    expect(result).toContain("**developer**");
    expect(result).toContain("I can help!");
  });

  it("uses 'Assistant' when no agentId", async () => {
    const { exportConversationToMarkdown } = await import("../export");
    const result = exportConversationToMarkdown({
      title: "Chat",
      messages: [
        { role: "assistant", content: "Hello!" },
      ],
    });
    expect(result).toContain("**Assistant**");
  });

  it("handles empty messages", async () => {
    const { exportConversationToMarkdown } = await import("../export");
    const result = exportConversationToMarkdown({
      title: "Empty Chat",
      messages: [],
    });
    expect(result).toContain("# Empty Chat");
    expect(result).toContain("No messages");
  });

  it("includes metadata header", async () => {
    const { exportConversationToMarkdown } = await import("../export");
    const result = exportConversationToMarkdown({
      title: "My Chat",
      messages: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello!", agentId: "developer" },
      ],
      exportedAt: "2026-03-03T12:00:00Z",
    });
    expect(result).toContain("Exported:");
    expect(result).toContain("Messages: 2");
  });

  it("preserves code blocks in messages", async () => {
    const { exportConversationToMarkdown } = await import("../export");
    const codeContent = "Here's the code:\n```typescript\nconst x = 1;\n```";
    const result = exportConversationToMarkdown({
      title: "Code Chat",
      messages: [
        { role: "assistant", content: codeContent, agentId: "developer" },
      ],
    });
    expect(result).toContain("```typescript");
    expect(result).toContain("const x = 1;");
  });

  it("separates messages with horizontal rules", async () => {
    const { exportConversationToMarkdown } = await import("../export");
    const result = exportConversationToMarkdown({
      title: "Chat",
      messages: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello!" },
      ],
    });
    expect(result).toContain("---");
  });
});
