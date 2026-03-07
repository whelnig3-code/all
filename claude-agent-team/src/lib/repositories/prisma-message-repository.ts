/**
 * prisma-message-repository.ts — Prisma 기반 메시지 저장소
 */

import type {
  MessageRepository,
  MessageData,
  CreateMessageInput,
} from "./types";

function getPrismaClient() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaClient } = require("@/generated/prisma");
  return new PrismaClient();
}

export class PrismaMessageRepository implements MessageRepository {
  private prisma = getPrismaClient();

  async findByConversationId(conversationId: string): Promise<MessageData[]> {
    const rows = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });

    return rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      role: r.role as "user" | "assistant",
      content: r.content as string,
      agentId: (r.agentId as string) ?? undefined,
      createdAt: (r.createdAt as Date).toISOString(),
    }));
  }

  async create(conversationId: string, data: CreateMessageInput): Promise<MessageData> {
    const [row] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId,
          role: data.role,
          content: data.content,
          agentId: data.agentId ?? null,
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { messageCount: { increment: 1 } },
      }),
    ]);

    return {
      id: row.id,
      role: row.role,
      content: row.content,
      agentId: row.agentId ?? undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
