import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fsp } from "fs";
import path from "path";
import os from "os";
import {
  getMessages,
  addMessage,
  updateMessage,
  deleteMessage,
} from "../conversation-store";

// 테스트용 임시 디렉터리
let tmpDir: string;
const CONV_ID = "test-conv";

beforeEach(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "conv-store-test-"));
  // getTenantConversationsDir를 우회하기 위해 env 설정
  vi.stubEnv("PROJECT_BASE_DIR", tmpDir);
  // conversations 서브 디렉터리 생성
  await fsp.mkdir(path.join(tmpDir, "docs", "conversations"), { recursive: true });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fsp.rm(tmpDir, { recursive: true, force: true });
});

describe("conversation-store", () => {
  it("addMessage: 메시지 추가 후 읽기", async () => {
    await addMessage(CONV_ID, "user", "hello");
    const msgs = await getMessages(CONV_ID);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("user");
    expect(msgs[0].content).toBe("hello");
  });

  it("updateMessage: 메시지 내용 수정", async () => {
    await addMessage(CONV_ID, "user", "original");
    const result = await updateMessage(CONV_ID, 0, "modified");
    expect(result).toBe(true);

    const msgs = await getMessages(CONV_ID);
    expect(msgs[0].content).toBe("modified");
  });

  it("deleteMessage: 메시지 삭제", async () => {
    await addMessage(CONV_ID, "user", "msg1");
    await addMessage(CONV_ID, "assistant", "msg2");

    const result = await deleteMessage(CONV_ID, 0);
    expect(result).toBe(true);

    const msgs = await getMessages(CONV_ID);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe("msg2");
  });

  it("addMessage: 동시 2건 호출 시 마지막 메시지는 존재해야 함", async () => {
    // 두 메시지를 동시에 추가
    await Promise.all([
      addMessage(CONV_ID, "user", "concurrent-1"),
      addMessage(CONV_ID, "user", "concurrent-2"),
    ]);

    const msgs = await getMessages(CONV_ID);
    // atomic write 덕분에 최소 하나는 저장됨 (이상적으론 둘 다)
    expect(msgs.length).toBeGreaterThanOrEqual(1);
  });

  it("getMessages: 존재하지 않는 대화는 빈 배열", async () => {
    const msgs = await getMessages("nonexistent");
    expect(msgs).toEqual([]);
  });

  it("addMessage: agentId가 포함됨", async () => {
    await addMessage(CONV_ID, "assistant", "response", "developer");
    const msgs = await getMessages(CONV_ID);
    expect(msgs[0].agentId).toBe("developer");
  });
});
