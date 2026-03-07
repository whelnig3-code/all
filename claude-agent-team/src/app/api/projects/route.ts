import { NextRequest } from "next/server";
import { promises as fsp } from "fs";
import path from "path";
import crypto from "crypto";
import { withErrorHandler } from "@/lib/api-handler";
import { AppError } from "@/lib/errors";
import { createProjectSchema } from "@/lib/schemas";
import { getTenantProjectsDir } from "@/lib/tenant/tenant-paths";
import { getTenantIdFromRequest } from "@/lib/tenant/request-helpers";

interface ProjectMeta {
  id: string;
  name: string;
  icon: string;
  description: string;
  path: string;
  createdAt: string;
  updatedAt: string;
}

async function loadProjects(tenantId?: string): Promise<ProjectMeta[]> {
  const dir = getTenantProjectsDir(tenantId);
  try {
    await fsp.mkdir(dir, { recursive: true });
    const files = await fsp.readdir(dir);
    const projects: ProjectMeta[] = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        const raw = await fsp.readFile(path.join(dir, f), "utf-8");
        projects.push(JSON.parse(raw));
      } catch {}
    }
    return projects.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    return [];
  }
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const tenantId = getTenantIdFromRequest(req);
  const projects = await loadProjects(tenantId);
  return Response.json({ projects });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await req.json();
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.validationError("Invalid input", parsed.error.flatten());
  }
  const { name, icon, description, path: projectPath } = parsed.data;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const project: ProjectMeta = {
    id,
    name,
    icon: icon || "📁",
    description: description || "",
    path: projectPath || "",
    createdAt: now,
    updatedAt: now,
  };
  const tenantId = getTenantIdFromRequest(req);
  const dir = getTenantProjectsDir(tenantId);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, `${id}.json`), JSON.stringify(project, null, 2), "utf-8");
  return Response.json({ project });
});
