import { NextRequest } from "next/server";
import { promises as fsp } from "fs";
import path from "path";
import { withErrorHandler } from "@/lib/api-handler";
import { AppError } from "@/lib/errors";
import { updateConversationSchema } from "@/lib/schemas";
import { getTenantConversationsDir } from "@/lib/tenant/tenant-paths";
import { getTenantIdFromRequest } from "@/lib/tenant/request-helpers";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateConversationId(id: string): void {
  if (!UUID_REGEX.test(id)) {
    throw AppError.badRequest("Invalid conversation ID format");
  }
}

export const DELETE = withErrorHandler(async (
  _req: NextRequest,
  context?: unknown
) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  validateConversationId(id);
  const filePath = path.join(getTenantConversationsDir(getTenantIdFromRequest(_req)), `${id}.json`);
  await fsp.unlink(filePath).catch(() => {});
  return Response.json({ ok: true });
});

export const GET = withErrorHandler(async (
  _req: NextRequest,
  context?: unknown
) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  validateConversationId(id);
  const filePath = path.join(getTenantConversationsDir(getTenantIdFromRequest(_req)), `${id}.json`);
  try {
    const raw = await fsp.readFile(filePath, "utf-8");
    return Response.json(JSON.parse(raw));
  } catch {
    throw AppError.notFound("Conversation not found");
  }
});

export const PATCH = withErrorHandler(async (
  req: NextRequest,
  context?: unknown
) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  validateConversationId(id);
  const filePath = path.join(getTenantConversationsDir(getTenantIdFromRequest(req)), `${id}.json`);
  const raw = await fsp.readFile(filePath, "utf-8");
  const conv = JSON.parse(raw);
  const body = await req.json();
  const parsed = updateConversationSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.validationError("Invalid input", parsed.error.flatten());
  }
  const updated = {
    ...conv,
    ...(parsed.data.title !== undefined && { title: parsed.data.title }),
    updatedAt: new Date().toISOString(),
  };
  await fsp.writeFile(filePath, JSON.stringify(updated, null, 2));
  return Response.json({ conversation: updated });
});
