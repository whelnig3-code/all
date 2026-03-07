import { NextRequest } from "next/server";
import { getMessages, addMessage, updateMessage, deleteMessage } from "@/lib/conversation-store";
import { withErrorHandler } from "@/lib/api-handler";
import { AppError } from "@/lib/errors";
import { addMessageSchema, updateMessageSchema, deleteMessageSchema } from "@/lib/schemas";
import { getTenantIdFromRequest } from "@/lib/tenant/request-helpers";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const tenantId = getTenantIdFromRequest(req);
  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get("conversationId");
  if (!conversationId) {
    return Response.json({ messages: [] });
  }
  const messages = await getMessages(conversationId, tenantId);
  return Response.json({ messages });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const tenantId = getTenantIdFromRequest(req);
  const body = await req.json();
  const parsed = addMessageSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.validationError("Invalid input", parsed.error.flatten());
  }
  const { conversationId, role, content } = parsed.data;
  await addMessage(conversationId, role, content, undefined, tenantId);
  return Response.json({ ok: true });
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const tenantId = getTenantIdFromRequest(req);
  const body = await req.json();
  const parsed = updateMessageSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.validationError("Invalid input", parsed.error.flatten());
  }
  const { conversationId, messageIndex, content } = parsed.data;
  const ok = await updateMessage(conversationId, messageIndex, content, tenantId);
  if (!ok) {
    throw AppError.notFound("Message not found");
  }
  return Response.json({ ok: true });
});

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const tenantId = getTenantIdFromRequest(req);
  const body = await req.json();
  const parsed = deleteMessageSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.validationError("Invalid input", parsed.error.flatten());
  }
  const { conversationId, messageIndex } = parsed.data;
  const ok = await deleteMessage(conversationId, messageIndex, tenantId);
  if (!ok) {
    throw AppError.notFound("Message not found");
  }
  return Response.json({ ok: true });
});
