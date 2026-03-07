/**
 * prisma-conversation-repository.ts — Prisma 기반 대화 저장소
 *
 * STORAGE_BACKEND=prisma 일 때 사용. Prisma Client가 설치되어 있어야 동작.
 * DB 연결이 안 되면 에러를 던진다 (file 백엔드로 폴백하지 않음).
 */

import type {
  ConversationRepository,
  ConversationSummary,
  ConversationDetail,
  CreateConversationInput,
  UpdateConversationInput,
  ConversationQueryOptions,
} from "./types";

function getPrismaClient() {
  // 동적 import: prisma generate 후에만 존재
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaClient } = require("@/generated/prisma");
  return new PrismaClient();
}

export class PrismaConversationRepository implements ConversationRepository {
  private prisma = getPrismaClient();

  async findAll(options?: ConversationQueryOptions): Promise<ConversationSummary[]> {
    const where: Record<string, unknown> = {};
    if (options?.projectId) where.projectId = options.projectId;
    if (options?.q) where.title = { contains: options.q, mode: "insensitive" };

    const rows = await this.prisma.conversation.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, projectId: true, messageCount: true, createdAt: true, updatedAt: true },
    });

    return rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      title: r.title as string,
      projectId: (r.projectId as string) ?? null,
      messageCount: r.messageCount as number,
      createdAt: (r.createdAt as Date).toISOString(),
      updatedAt: (r.updatedAt as Date).toISOString(),
    }));
  }

  async findById(id: string): Promise<ConversationDetail | null> {
    const row = await this.prisma.conversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!row) return null;

    return {
      id: row.id,
      title: row.title,
      projectId: row.projectId ?? null,
      messageCount: row.messageCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      messages: row.messages.map((m: Record<string, unknown>) => ({
        id: m.id as string,
        role: m.role as "user" | "assistant",
        content: m.content as string,
        agentId: (m.agentId as string) ?? undefined,
        createdAt: (m.createdAt as Date).toISOString(),
      })),
    };
  }

  async create(data: CreateConversationInput): Promise<ConversationSummary> {
    const row = await this.prisma.conversation.create({
      data: { title: data.title ?? "", projectId: data.projectId ?? null },
    });
    return {
      id: row.id,
      title: row.title,
      projectId: row.projectId ?? null,
      messageCount: 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async update(id: string, data: UpdateConversationInput): Promise<ConversationSummary> {
    const row = await this.prisma.conversation.update({
      where: { id },
      data: { title: data.title },
    });
    return {
      id: row.id,
      title: row.title,
      projectId: row.projectId ?? null,
      messageCount: row.messageCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async delete(id: string): Promise<void> {
    await this.prisma.conversation.delete({ where: { id } });
  }
}
