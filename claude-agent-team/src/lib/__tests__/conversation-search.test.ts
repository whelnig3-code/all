import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fsp } from "fs";
import path from "path";
import os from "os";

// We'll test a new searchConversations function
describe("searchConversations", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory for test data
    tempDir = path.join(os.tmpdir(), `conv-test-${Date.now()}`);
    await fsp.mkdir(tempDir, { recursive: true });

    // Mock getConversationsDir to use temp
    vi.doMock("@/lib/paths", () => ({
      getConversationsDir: () => tempDir,
      ensureDir: async (dir: string) => fsp.mkdir(dir, { recursive: true }),
    }));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fsp.rm(tempDir, { recursive: true, force: true });
  });

  it("returns all conversations when no query provided", async () => {
    // Setup: create test conversation files
    await createTestConversation(tempDir, "conv-1", { title: "First Chat", projectId: "proj-a" }, [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ]);
    await createTestConversation(tempDir, "conv-2", { title: "Bug Fix Discussion", projectId: "proj-b" }, [
      { role: "user", content: "There's a bug" },
    ]);

    const { searchConversations } = await import("../conversation-search");
    const results = await searchConversations(tempDir);
    expect(results).toHaveLength(2);
  });

  it("filters by keyword in messages", async () => {
    await createTestConversation(tempDir, "conv-1", { title: "Chat A" }, [
      { role: "user", content: "How to implement authentication?" },
      { role: "assistant", content: "Use JWT tokens" },
    ]);
    await createTestConversation(tempDir, "conv-2", { title: "Chat B" }, [
      { role: "user", content: "Fix the CSS layout" },
    ]);

    const { searchConversations } = await import("../conversation-search");
    const results = await searchConversations(tempDir, { q: "authentication" });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("conv-1");
  });

  it("filters by keyword in title", async () => {
    await createTestConversation(tempDir, "conv-1", { title: "Security Audit" }, [
      { role: "user", content: "Check for vulnerabilities" },
    ]);
    await createTestConversation(tempDir, "conv-2", { title: "Database Design" }, [
      { role: "user", content: "Create schema" },
    ]);

    const { searchConversations } = await import("../conversation-search");
    const results = await searchConversations(tempDir, { q: "security" });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("conv-1");
  });

  it("filters by projectId", async () => {
    await createTestConversation(tempDir, "conv-1", { title: "Chat", projectId: "proj-a" }, []);
    await createTestConversation(tempDir, "conv-2", { title: "Chat", projectId: "proj-b" }, []);
    await createTestConversation(tempDir, "conv-3", { title: "Chat", projectId: "proj-a" }, []);

    const { searchConversations } = await import("../conversation-search");
    const results = await searchConversations(tempDir, { projectId: "proj-a" });
    expect(results).toHaveLength(2);
  });

  it("combines keyword and projectId filters", async () => {
    await createTestConversation(tempDir, "conv-1", { title: "Bug Fix", projectId: "proj-a" }, [
      { role: "user", content: "Fix the login bug" },
    ]);
    await createTestConversation(tempDir, "conv-2", { title: "Bug Report", projectId: "proj-b" }, [
      { role: "user", content: "Login page crashes" },
    ]);

    const { searchConversations } = await import("../conversation-search");
    const results = await searchConversations(tempDir, { q: "bug", projectId: "proj-a" });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("conv-1");
  });

  it("search is case-insensitive", async () => {
    await createTestConversation(tempDir, "conv-1", { title: "React Components" }, [
      { role: "user", content: "How to use REACT hooks?" },
    ]);

    const { searchConversations } = await import("../conversation-search");
    const results = await searchConversations(tempDir, { q: "react" });
    expect(results).toHaveLength(1);
  });

  it("returns empty array for no matches", async () => {
    await createTestConversation(tempDir, "conv-1", { title: "Chat" }, [
      { role: "user", content: "Hello world" },
    ]);

    const { searchConversations } = await import("../conversation-search");
    const results = await searchConversations(tempDir, { q: "nonexistent" });
    expect(results).toHaveLength(0);
  });

  it("returns empty array when conversations dir is empty", async () => {
    const { searchConversations } = await import("../conversation-search");
    const results = await searchConversations(tempDir);
    expect(results).toEqual([]);
  });
});

// Helper to create test conversation files
async function createTestConversation(
  dir: string,
  id: string,
  meta: { title?: string; projectId?: string },
  messages: Array<{ role: string; content: string }>,
) {
  // Create metadata file
  await fsp.writeFile(
    path.join(dir, `${id}.meta.json`),
    JSON.stringify({ id, title: meta.title ?? id, projectId: meta.projectId, createdAt: new Date().toISOString() }),
  );
  // Create messages file
  await fsp.writeFile(
    path.join(dir, `${id}.messages.json`),
    JSON.stringify(messages),
  );
}
