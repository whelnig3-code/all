import { NextRequest } from "next/server";
import { promises as fsp } from "fs";
import path from "path";
import { withErrorHandler } from "@/lib/api-handler";
import { AppError } from "@/lib/errors";
import { getMessages } from "@/lib/conversation-store";
import { exportConversationToMarkdown } from "@/lib/export";
import { getTenantConversationsDir } from "@/lib/tenant/tenant-paths";
import { getTenantIdFromRequest } from "@/lib/tenant/request-helpers";

export const GET = withErrorHandler(async (
  _req: NextRequest,
  context?: unknown,
) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  if (!id) throw AppError.badRequest("Missing conversation ID");

  // Read metadata to get conversation title
  const metaPath = path.join(getTenantConversationsDir(getTenantIdFromRequest(_req)), `${id}.meta.json`);
  let title = id;
  try {
    const raw = await fsp.readFile(metaPath, "utf-8");
    const meta = JSON.parse(raw);
    title = meta.title ?? id;
  } catch {
    // Use ID as title fallback if no meta file exists
  }

  // Read messages
  const tenantId = getTenantIdFromRequest(_req);
  const messages = await getMessages(id, tenantId);

  if (messages.length === 0) {
    // Verify the conversation file exists before returning empty export
    const msgPath = path.join(getTenantConversationsDir(getTenantIdFromRequest(_req)), `${id}.messages.json`);
    try {
      await fsp.access(msgPath);
    } catch {
      throw AppError.notFound(`Conversation ${id} not found`);
    }
  }

  const markdown = exportConversationToMarkdown({
    title,
    messages,
    exportedAt: new Date().toISOString(),
  });

  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${id}.md"`,
    },
  });
});
