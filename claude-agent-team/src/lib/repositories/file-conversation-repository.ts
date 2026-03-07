/**
 * File-based ConversationRepository implementation.
 *
 * Think of this like a physical filing cabinet: each conversation is a folder
 * with a metadata card ({id}.json) and a stack of message slips
 * ({id}.messages.json). When we migrate to PostgreSQL, we simply swap this
 * cabinet for a database — the rest of the code never knows the difference.
 *
 * Implements ConversationRepository using the existing file-based approach.
 * When migrating to Prisma, create PrismaConversationRepository with the
 * same interface and swap the factory function.
 */

import { promises as fsp } from "fs";
import path from "path";
import crypto from "crypto";
import { getConversationsDir, ensureDir } from "@/lib/paths";
import type {
  ConversationRepository,
  ConversationSummary,
  ConversationDetail,
  ConversationQueryOptions,
  CreateConversationInput,
  UpdateConversationInput,
  MessageData,
} from "./types";

interface StoredMeta {
  id: string;
  projectId: string | null;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  agentId?: string;
}

function getMetaPath(id: string): string {
  return path.join(getConversationsDir(), `${id}.json`);
}

function getMessagesPath(id: string): string {
  return path.join(getConversationsDir(), `${id}.messages.json`);
}

async function readMeta(id: string): Promise<StoredMeta | null> {
  try {
    const raw = await fsp.readFile(getMetaPath(id), "utf-8");
    return JSON.parse(raw) as StoredMeta;
  } catch {
    return null;
  }
}

async function readAllMetas(): Promise<StoredMeta[]> {
  const dir = getConversationsDir();
  try {
    await ensureDir(dir);
    const files = await fsp.readdir(dir);
    const metas: StoredMeta[] = [];
    for (const f of files) {
      if (!f.endsWith(".json") || f.endsWith(".messages.json")) continue;
      try {
        const raw = await fsp.readFile(path.join(dir, f), "utf-8");
        metas.push(JSON.parse(raw) as StoredMeta);
      } catch {
        // Skip corrupt files
      }
    }
    return metas;
  } catch {
    return [];
  }
}

async function readMessages(conversationId: string): Promise<StoredMessage[]> {
  try {
    const raw = await fsp.readFile(getMessagesPath(conversationId), "utf-8");
    return JSON.parse(raw) as StoredMessage[];
  } catch {
    return [];
  }
}

function toSummary(meta: StoredMeta): ConversationSummary {
  return {
    id: meta.id,
    title: meta.title,
    projectId: meta.projectId,
    messageCount: meta.messageCount,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  };
}

function storedMessageToData(msg: StoredMessage, index: number): MessageData {
  return {
    id: `msg-${index}`,
    role: msg.role,
    content: msg.content,
    agentId: msg.agentId,
    createdAt: new Date().toISOString(), // File-based store doesn't track per-message timestamps
  };
}

function matchesQuery(meta: StoredMeta, q: string): boolean {
  const lower = q.toLowerCase();
  return meta.title.toLowerCase().includes(lower);
}

export class FileConversationRepository implements ConversationRepository {
  async findAll(options?: ConversationQueryOptions): Promise<ConversationSummary[]> {
    const allMetas = await readAllMetas();

    const filtered = allMetas.filter((meta) => {
      if (options?.projectId && meta.projectId !== options.projectId) {
        return false;
      }
      if (options?.q && !matchesQuery(meta, options.q)) {
        return false;
      }
      return true;
    });

    // Sort by updatedAt descending (most recent first)
    const sorted = [...filtered].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return sorted.map(toSummary);
  }

  async findById(id: string): Promise<ConversationDetail | null> {
    const meta = await readMeta(id);
    if (!meta) return null;

    const storedMessages = await readMessages(id);
    const messages: MessageData[] = storedMessages.map(storedMessageToData);

    return {
      ...toSummary(meta),
      messages,
    };
  }

  async create(data: CreateConversationInput): Promise<ConversationSummary> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const meta: StoredMeta = {
      id,
      projectId: data.projectId ?? null,
      title: data.title || "새 대화",
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    const dir = getConversationsDir();
    await ensureDir(dir);
    await fsp.writeFile(getMetaPath(id), JSON.stringify(meta, null, 2), "utf-8");

    return toSummary(meta);
  }

  async update(id: string, data: UpdateConversationInput): Promise<ConversationSummary> {
    const meta = await readMeta(id);
    if (!meta) {
      throw new Error(`Conversation not found: ${id}`);
    }

    const updated: StoredMeta = {
      ...meta,
      ...(data.title !== undefined ? { title: data.title } : {}),
      updatedAt: new Date().toISOString(),
    };

    await fsp.writeFile(getMetaPath(id), JSON.stringify(updated, null, 2), "utf-8");

    return toSummary(updated);
  }

  async delete(id: string): Promise<void> {
    // Delete both meta and messages files
    await fsp.unlink(getMetaPath(id)).catch(() => {});
    await fsp.unlink(getMessagesPath(id)).catch(() => {});
  }
}
