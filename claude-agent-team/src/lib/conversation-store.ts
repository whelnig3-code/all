// 대화 히스토리 파일 기반 저장소
// docs/conversations/{id}.messages.json 으로 영속 저장

import { promises as fsp } from "fs";
import path from "path";
import { ensureDir } from "@/lib/paths";
import { getTenantConversationsDir } from "@/lib/tenant/tenant-paths";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("conversation-store");

/**
 * 원자적 파일 쓰기: tmp 파일에 먼저 저장 후 rename으로 교체.
 * 비유: 편지를 봉투에 넣고 봉인한 뒤(tmp 쓰기) 우편함에 넣는다(rename).
 * 쓰기 도중 크래시가 발생해도 원본 파일은 손상되지 않는다.
 */
async function atomicWrite(filePath: string, data: string): Promise<void> {
  const tmpPath = `${filePath}.${Date.now()}.tmp`;
  await fsp.writeFile(tmpPath, data, "utf-8");
  await fsp.rename(tmpPath, filePath);
}

export interface Message {
  id?: string;       // 메시지 고유 ID (신규 메시지에만 부여)
  role: "user" | "assistant";
  content: string;
  agentId?: string;  // 에이전트 응답에만 사용
}

// 최대 보관 메시지 수
const MAX_MESSAGES = 40;

function getMessagesPath(conversationId: string, tenantId?: string): string {
  return path.join(getTenantConversationsDir(tenantId), `${conversationId}.messages.json`);
}

/**
 * 메시지 파일 읽기 (비동기)
 */
export async function getMessages(conversationId: string, tenantId?: string): Promise<Message[]> {
  try {
    const filePath = getMessagesPath(conversationId, tenantId);
    const raw = await fsp.readFile(filePath, "utf-8");
    return JSON.parse(raw) as Message[];
  } catch {
    return [];
  }
}

/**
 * 메시지 추가 (비동기)
 * fire-and-forget 패턴이 필요한 호출부는 addMessage(...).catch(() => {}) 사용
 */
export async function addMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  agentId?: string,
  tenantId?: string
): Promise<void> {
  const filePath = getMessagesPath(conversationId, tenantId);
  const dir = path.dirname(filePath);

  try {
    await ensureDir(dir);

    let existing: Message[] = [];
    try {
      const raw = await fsp.readFile(filePath, "utf-8");
      existing = JSON.parse(raw);
    } catch { /* 파일 없으면 빈 배열 */ }

    // 불변 패턴: 새 배열 생성 후 길이 제한 적용
    const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const appended = [
      ...existing,
      { id, role, content, ...(agentId ? { agentId } : {}) },
    ];
    const trimmed = appended.length > MAX_MESSAGES
      ? appended.slice(appended.length - MAX_MESSAGES)
      : appended;

    await atomicWrite(filePath, JSON.stringify(trimmed, null, 2));
  } catch (e) {
    log.error({ err: e }, "addMessage error");
  }
}

/**
 * 메시지 내용 수정 (인덱스 기반)
 *
 * 불변 패턴: 전체 배열 읽기 → .map() 으로 새 배열 생성 → 파일 쓰기
 */
export async function updateMessage(
  conversationId: string,
  messageIndex: number,
  content: string,
  tenantId?: string,
): Promise<boolean> {
  const filePath = getMessagesPath(conversationId, tenantId);
  try {
    const raw = await fsp.readFile(filePath, "utf-8");
    const messages: Message[] = JSON.parse(raw);

    if (messageIndex < 0 || messageIndex >= messages.length) return false;

    const updated = messages.map((msg, i) =>
      i === messageIndex ? { ...msg, content } : msg,
    );
    await atomicWrite(filePath, JSON.stringify(updated, null, 2));
    return true;
  } catch (e) {
    log.error({ err: e }, "updateMessage error");
    return false;
  }
}

/**
 * 메시지 삭제 (인덱스 기반)
 *
 * 불변 패턴: 전체 배열 읽기 → .filter() 로 새 배열 생성 → 파일 쓰기
 */
export async function deleteMessage(
  conversationId: string,
  messageIndex: number,
  tenantId?: string,
): Promise<boolean> {
  const filePath = getMessagesPath(conversationId, tenantId);
  try {
    const raw = await fsp.readFile(filePath, "utf-8");
    const messages: Message[] = JSON.parse(raw);

    if (messageIndex < 0 || messageIndex >= messages.length) return false;

    const filtered = messages.filter((_, i) => i !== messageIndex);
    await atomicWrite(filePath, JSON.stringify(filtered, null, 2));
    return true;
  } catch (e) {
    log.error({ err: e }, "deleteMessage error");
    return false;
  }
}
