/**
 * File-based MessageRepository implementation.
 *
 * Messages are stored as a JSON array in {conversationId}.messages.json.
 * Like sticky notes in a notebook — each message is appended to the stack.
 * When we move to Prisma, each message becomes a row in the Message table.
 */

import { promises as fsp } from "fs";
import path from "path";
import crypto from "crypto";
import { getConversationsDir, ensureDir } from "@/lib/paths";
import type {
  MessageRepository,
  MessageData,
  CreateMessageInput,
} from "./types";

const MAX_MESSAGES = 40;

interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  agentId?: string;
}

function getMessagesPath(conversationId: string): string {
  return path.join(getConversationsDir(), `${conversationId}.messages.json`);
}

function getMetaPath(conversationId: string): string {
  return path.join(getConversationsDir(), `${conversationId}.json`);
}

async function readStoredMessages(conversationId: string): Promise<StoredMessage[]> {
  try {
    const raw = await fsp.readFile(getMessagesPath(conversationId), "utf-8");
    return JSON.parse(raw) as StoredMessage[];
  } catch {
    return [];
  }
}

function toMessageData(msg: StoredMessage, index: number): MessageData {
  return {
    id: `msg-${index}`,
    role: msg.role,
    content: msg.content,
    agentId: msg.agentId,
    createdAt: new Date().toISOString(),
  };
}

export class FileMessageRepository implements MessageRepository {
  async findByConversationId(conversationId: string): Promise<MessageData[]> {
    const stored = await readStoredMessages(conversationId);
    return stored.map(toMessageData);
  }

  async create(conversationId: string, data: CreateMessageInput): Promise<MessageData> {
    const filePath = getMessagesPath(conversationId);
    const dir = path.dirname(filePath);
    await ensureDir(dir);

    const existing = await readStoredMessages(conversationId);

    const newMessage: StoredMessage = {
      role: data.role,
      content: data.content,
      ...(data.agentId ? { agentId: data.agentId } : {}),
    };

    // Immutable: create new array, then trim to max length
    const appended = [...existing, newMessage];
    const trimmed = appended.length > MAX_MESSAGES
      ? appended.slice(appended.length - MAX_MESSAGES)
      : appended;

    await fsp.writeFile(filePath, JSON.stringify(trimmed, null, 2), "utf-8");

    // Update conversation meta messageCount
    try {
      const metaPath = getMetaPath(conversationId);
      const raw = await fsp.readFile(metaPath, "utf-8");
      const meta = JSON.parse(raw);
      const updatedMeta = {
        ...meta,
        messageCount: trimmed.length,
        updatedAt: new Date().toISOString(),
      };
      await fsp.writeFile(metaPath, JSON.stringify(updatedMeta, null, 2), "utf-8");
    } catch {
      // Meta file might not exist yet — skip silently
    }

    const id = crypto.randomUUID();
    return {
      id,
      role: data.role,
      content: data.content,
      agentId: data.agentId,
      createdAt: new Date().toISOString(),
    };
  }
}
