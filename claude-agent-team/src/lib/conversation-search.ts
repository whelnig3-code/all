/**
 * Conversation search/filter module
 *
 * Searches conversation metadata and message files
 * to find conversations matching keyword and/or project filters.
 *
 * Like a librarian searching both book titles and page contents --
 * this module checks both conversation titles and message contents
 * to find relevant matches.
 */

import { promises as fsp } from "fs";
import path from "path";

interface ConversationMeta {
  readonly id: string;
  readonly title: string;
  readonly projectId?: string;
  readonly createdAt?: string;
}

interface Message {
  readonly role: string;
  readonly content: string;
}

export interface SearchOptions {
  readonly q?: string;
  readonly projectId?: string;
}

export interface SearchResult {
  readonly id: string;
  readonly title: string;
  readonly projectId?: string;
  readonly createdAt?: string;
  readonly matchCount?: number;
}

/**
 * Read and parse a JSON file, returning null on any error.
 */
async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fsp.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Check if any message content contains the query string (case-insensitive).
 */
function messagesContainQuery(messages: readonly Message[], query: string): boolean {
  const lowerQuery = query.toLowerCase();
  return messages.some((m) => m.content.toLowerCase().includes(lowerQuery));
}

/**
 * Check if a conversation matches the keyword query.
 * Searches both title and message contents (case-insensitive).
 */
async function matchesKeyword(
  conversationsDir: string,
  meta: ConversationMeta,
  metaFileName: string,
  query: string,
): Promise<boolean> {
  const lowerQuery = query.toLowerCase();

  // Check title first (cheaper)
  if (meta.title.toLowerCase().includes(lowerQuery)) {
    return true;
  }

  // Check message contents
  const msgFileName = metaFileName.replace(".meta.json", ".messages.json");
  const msgPath = path.join(conversationsDir, msgFileName);
  const messages = await readJsonFile<Message[]>(msgPath);

  if (messages && messagesContainQuery(messages, query)) {
    return true;
  }

  return false;
}

/**
 * Check if a conversation matches the projectId filter.
 */
function matchesProjectId(meta: ConversationMeta, projectId: string): boolean {
  return meta.projectId === projectId;
}

/**
 * List all meta files in the conversations directory.
 */
async function listMetaFiles(conversationsDir: string): Promise<string[]> {
  try {
    const files = await fsp.readdir(conversationsDir);
    return files.filter((f) => f.endsWith(".meta.json"));
  } catch {
    return [];
  }
}

/**
 * Search conversations by keyword and/or projectId.
 *
 * @param conversationsDir - Path to the conversations directory
 * @param options - Optional search filters (q for keyword, projectId for project filter)
 * @returns Array of matching conversation search results
 */
export async function searchConversations(
  conversationsDir: string,
  options?: SearchOptions,
): Promise<SearchResult[]> {
  const metaFiles = await listMetaFiles(conversationsDir);

  if (metaFiles.length === 0) {
    return [];
  }

  const results: SearchResult[] = [];

  for (const metaFile of metaFiles) {
    const metaPath = path.join(conversationsDir, metaFile);
    const meta = await readJsonFile<ConversationMeta>(metaPath);

    if (!meta) {
      continue;
    }

    // Filter by projectId
    if (options?.projectId && !matchesProjectId(meta, options.projectId)) {
      continue;
    }

    // Filter by keyword
    if (options?.q) {
      const isMatch = await matchesKeyword(conversationsDir, meta, metaFile, options.q);
      if (!isMatch) {
        continue;
      }
    }

    results.push({
      id: meta.id,
      title: meta.title,
      projectId: meta.projectId,
      createdAt: meta.createdAt,
    });
  }

  return results;
}
