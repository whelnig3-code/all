/**
 * prisma-custom-agent-repository.ts — Prisma 기반 커스텀 에이전트 저장소
 */

import type {
  CustomAgentRepository,
  CustomAgentData,
  CreateCustomAgentRepoInput,
  UpdateCustomAgentRepoInput,
} from "./types";

function getPrismaClient() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaClient } = require("@/generated/prisma");
  return new PrismaClient();
}

export class PrismaCustomAgentRepository implements CustomAgentRepository {
  private prisma = getPrismaClient();

  async findAll(): Promise<CustomAgentData[]> {
    const rows = await this.prisma.customAgent.findMany({
      orderBy: { createdAt: "desc" },
    });

    return rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      name: r.name as string,
      icon: r.icon as string,
      color: r.color as string,
      description: r.description as string,
      model: r.model as string,
      systemPrompt: r.systemPrompt as string,
      createdAt: (r.createdAt as Date).toISOString(),
      updatedAt: (r.updatedAt as Date).toISOString(),
    }));
  }

  async findById(id: string): Promise<CustomAgentData | null> {
    const row = await this.prisma.customAgent.findUnique({ where: { id } });
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      icon: row.icon,
      color: row.color,
      description: row.description,
      model: row.model,
      systemPrompt: row.systemPrompt,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async create(data: CreateCustomAgentRepoInput): Promise<CustomAgentData> {
    const row = await this.prisma.customAgent.create({
      data: {
        id: data.id,
        name: data.name,
        icon: data.icon ?? "🤖",
        color: data.color ?? "#6B7280",
        description: data.description ?? "",
        model: data.model ?? "sonnet",
        systemPrompt: data.systemPrompt,
      },
    });

    return {
      id: row.id,
      name: row.name,
      icon: row.icon,
      color: row.color,
      description: row.description,
      model: row.model,
      systemPrompt: row.systemPrompt,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async update(id: string, data: UpdateCustomAgentRepoInput): Promise<CustomAgentData> {
    const row = await this.prisma.customAgent.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.icon !== undefined && { icon: data.icon }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.model !== undefined && { model: data.model }),
        ...(data.systemPrompt !== undefined && { systemPrompt: data.systemPrompt }),
      },
    });

    return {
      id: row.id,
      name: row.name,
      icon: row.icon,
      color: row.color,
      description: row.description,
      model: row.model,
      systemPrompt: row.systemPrompt,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async delete(id: string): Promise<void> {
    await this.prisma.customAgent.delete({ where: { id } });
  }
}
