/**
 * repository-factory.ts — 저장소 백엔드 팩토리
 *
 * 비유: 서류함(파일)과 데이터베이스(Prisma) 두 창구를 하나의 접수 데스크로 통합.
 * STORAGE_BACKEND=file|prisma 환경 변수로 전환 (기본값: file)
 */

import type {
  ConversationRepository,
  MessageRepository,
  CustomAgentRepository,
} from "./types";

export type StorageBackend = "file" | "prisma";

function getBackend(): StorageBackend {
  const env = process.env.STORAGE_BACKEND?.toLowerCase();
  if (env === "prisma") return "prisma";
  return "file";
}

let cachedConversationRepo: ConversationRepository | null = null;
let cachedMessageRepo: MessageRepository | null = null;
let cachedCustomAgentRepo: CustomAgentRepository | null = null;

export async function getConversationRepository(): Promise<ConversationRepository> {
  if (cachedConversationRepo) return cachedConversationRepo;

  const backend = getBackend();
  if (backend === "prisma") {
    const { PrismaConversationRepository } = await import("./prisma-conversation-repository");
    cachedConversationRepo = new PrismaConversationRepository();
  } else {
    const { FileConversationRepository } = await import("./file-conversation-repository");
    cachedConversationRepo = new FileConversationRepository();
  }
  return cachedConversationRepo;
}

export async function getMessageRepository(): Promise<MessageRepository> {
  if (cachedMessageRepo) return cachedMessageRepo;

  const backend = getBackend();
  if (backend === "prisma") {
    const { PrismaMessageRepository } = await import("./prisma-message-repository");
    cachedMessageRepo = new PrismaMessageRepository();
  } else {
    const { FileMessageRepository } = await import("./file-message-repository");
    cachedMessageRepo = new FileMessageRepository();
  }
  return cachedMessageRepo;
}

export async function getCustomAgentRepository(): Promise<CustomAgentRepository> {
  if (cachedCustomAgentRepo) return cachedCustomAgentRepo;

  const backend = getBackend();
  if (backend === "prisma") {
    const { PrismaCustomAgentRepository } = await import("./prisma-custom-agent-repository");
    cachedCustomAgentRepo = new PrismaCustomAgentRepository();
  } else {
    const { FileCustomAgentRepository } = await import("./file-custom-agent-repository");
    cachedCustomAgentRepo = new FileCustomAgentRepository();
  }
  return cachedCustomAgentRepo;
}

/** 테스트용: 캐시 클리어 */
export function clearRepositoryCache(): void {
  cachedConversationRepo = null;
  cachedMessageRepo = null;
  cachedCustomAgentRepo = null;
}
