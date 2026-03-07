import { NextRequest } from "next/server";
import { promises as fsp } from "fs";
import path from "path";
import { withErrorHandler } from "@/lib/api-handler";
import { AppError } from "@/lib/errors";
import { updateProjectSchema } from "@/lib/schemas";
import { getTenantProjectsDir } from "@/lib/tenant/tenant-paths";
import { getTenantIdFromRequest } from "@/lib/tenant/request-helpers";

export const DELETE = withErrorHandler(async (
  _req: NextRequest,
  context?: unknown
) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const filePath = path.join(getTenantProjectsDir(getTenantIdFromRequest(_req)), `${id}.json`);
  await fsp.unlink(filePath).catch(() => {});
  return Response.json({ ok: true });
});

export const PATCH = withErrorHandler(async (
  req: NextRequest,
  context?: unknown
) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const filePath = path.join(getTenantProjectsDir(getTenantIdFromRequest(req)), `${id}.json`);
  const raw = await fsp.readFile(filePath, "utf-8");
  const project = JSON.parse(raw);
  const body = await req.json();
  const parsed = updateProjectSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.validationError("Invalid input", parsed.error.flatten());
  }
  const updated = {
    ...project,
    ...(parsed.data.name !== undefined && { name: parsed.data.name }),
    ...(parsed.data.icon !== undefined && { icon: parsed.data.icon }),
    ...(parsed.data.description !== undefined && { description: parsed.data.description }),
    ...(parsed.data.path !== undefined && { path: parsed.data.path }),
    updatedAt: new Date().toISOString(),
  };
  await fsp.writeFile(filePath, JSON.stringify(updated, null, 2));
  return Response.json({ project: updated });
});
