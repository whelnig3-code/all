import { NextRequest } from "next/server";
import { promises as fsp } from "fs";
import path from "path";
import crypto from "crypto";
import { withErrorHandler, withRateLimit } from "@/lib/api-handler";
import { AppError } from "@/lib/errors";
import { createConversationSchema } from "@/lib/schemas";
import { searchConversations } from "@/lib/conversation-search";
import { getTenantConversationsDir } from "@/lib/tenant/tenant-paths";
import { getTenantIdFromRequest } from "@/lib/tenant/request-helpers";

interface ConversationMeta {
  id: string;
  projectId: string | null;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

async function loadConversations(tenantId?: string): Promise<ConversationMeta[]> {
  const dir = getTenantConversationsDir(tenantId);
  try {
    await fsp.mkdir(dir, { recursive: true });
    const files = await fsp.readdir(dir);
    const metas: ConversationMeta[] = [];
    for (const f of files) {
      if (!f.endsWith(".json") || f.endsWith(".messages.json")) continue;
      try {
        const raw = await fsp.readFile(path.join(dir, f), "utf-8");
        metas.push(JSON.parse(raw));
      } catch {}
    }
    return metas.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  } catch {
    return [];
  }
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const tenantId = getTenantIdFromRequest(req);
  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const projectId = req.nextUrl.searchParams.get("projectId") ?? undefined;

  // When search params are present, use searchConversations
  if (q || projectId) {
    const dir = getTenantConversationsDir(tenantId);
    const results = await searchConversations(dir, { q, projectId });
    return Response.json({ conversations: results });
  }

  // Default: return all conversations sorted by updatedAt
  const conversations = await loadConversations(tenantId);
  return Response.json({ conversations });
});

export const POST = withRateLimit(async (req: NextRequest) => {
  const tenantId = getTenantIdFromRequest(req);
  const body = await req.json();
  const parsed = createConversationSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.validationError("Invalid input", parsed.error.flatten());
  }
  const { projectId, title } = parsed.data;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const meta: ConversationMeta = {
    id,
    projectId: projectId ?? null,
    title: title || "새 대화",
    messageCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  const dir = getTenantConversationsDir(tenantId);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, `${id}.json`), JSON.stringify(meta, null, 2), "utf-8");
  return Response.json({ conversation: meta });
});
