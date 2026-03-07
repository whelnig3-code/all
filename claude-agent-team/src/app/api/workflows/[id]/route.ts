import { NextRequest } from "next/server";
import { promises as fsp } from "fs";
import path from "path";
import { withErrorHandler } from "@/lib/api-handler";
import { AppError } from "@/lib/errors";
import { updateWorkflowSchema } from "@/lib/schemas";
import { getTenantWorkflowsDir } from "@/lib/tenant/tenant-paths";
import { getTenantIdFromRequest } from "@/lib/tenant/request-helpers";

export const DELETE = withErrorHandler(async (
  _req: NextRequest,
  context?: unknown
) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const filePath = path.join(getTenantWorkflowsDir(getTenantIdFromRequest(_req)), `${id}.json`);
  try {
    await fsp.unlink(filePath);
    return Response.json({ success: true });
  } catch {
    throw AppError.notFound("Workflow not found");
  }
});

export const PATCH = withErrorHandler(async (
  req: NextRequest,
  context?: unknown
) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const filePath = path.join(getTenantWorkflowsDir(getTenantIdFromRequest(req)), `${id}.json`);
  try {
    const raw = await fsp.readFile(filePath, "utf-8");
    const workflow = JSON.parse(raw);
    const body = await req.json();
    const parsed = updateWorkflowSchema.safeParse(body);
    if (!parsed.success) {
      throw AppError.validationError("Invalid input", parsed.error.flatten());
    }
    const updated = { ...workflow, ...parsed.data, id, updatedAt: new Date().toISOString() };
    await fsp.writeFile(filePath, JSON.stringify(updated, null, 2));
    return Response.json({ workflow: updated });
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw AppError.notFound("Workflow not found");
  }
});
