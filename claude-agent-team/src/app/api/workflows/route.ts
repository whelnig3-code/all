import { NextRequest } from "next/server";
import { promises as fsp } from "fs";
import path from "path";
import crypto from "crypto";
import { withErrorHandler } from "@/lib/api-handler";
import { AppError } from "@/lib/errors";
import { createWorkflowSchema } from "@/lib/schemas";
import { getTenantWorkflowsDir } from "@/lib/tenant/tenant-paths";
import { getTenantIdFromRequest } from "@/lib/tenant/request-helpers";

export interface WorkflowMeta {
  id: string;
  name: string;
  description: string;
  steps: string[]; // agentId 배열
  createdAt: string;
  updatedAt: string;
}

async function loadWorkflows(tenantId?: string): Promise<WorkflowMeta[]> {
  const dir = getTenantWorkflowsDir(tenantId);
  await fsp.mkdir(dir, { recursive: true });
  const files = await fsp.readdir(dir);
  const result: WorkflowMeta[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      const raw = await fsp.readFile(path.join(dir, f), "utf-8");
      result.push(JSON.parse(raw));
    } catch { /* skip */ }
  }
  return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const tenantId = getTenantIdFromRequest(req);
  const workflows = await loadWorkflows(tenantId);
  return Response.json({ workflows });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const tenantId = getTenantIdFromRequest(req);
  const body = await req.json();
  const parsed = createWorkflowSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.validationError("Invalid input", parsed.error.flatten());
  }
  const { name, description, steps } = parsed.data;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const workflow: WorkflowMeta = { id, name, description, steps, createdAt: now, updatedAt: now };

  const dir = getTenantWorkflowsDir(tenantId);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, `${id}.json`), JSON.stringify(workflow, null, 2));

  return Response.json({ workflow }, { status: 201 });
});
