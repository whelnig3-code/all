import { NextRequest } from "next/server";
import { promises as fsp } from "fs";
import path from "path";
import { getProjectBase } from "@/lib/utils/env";
import { withErrorHandler } from "@/lib/api-handler";
import { AppError } from "@/lib/errors";
import { updateSettingsSchema } from "@/lib/schemas";
import { getTenantSettingsPath } from "@/lib/tenant/tenant-paths";
import { getTenantIdFromRequest } from "@/lib/tenant/request-helpers";

interface AppSettings {
  projectBasePath: string;
  defaultModel: string;
  agentModels: Record<string, string>;
  updatedAt: string;
}

async function loadSettings(tenantId?: string): Promise<AppSettings> {
  try {
    const raw = await fsp.readFile(getTenantSettingsPath(tenantId), "utf-8");
    return JSON.parse(raw);
  } catch {
    return {
      projectBasePath: getProjectBase(),
      defaultModel: "sonnet",
      agentModels: {},
      updatedAt: new Date().toISOString(),
    };
  }
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const tenantId = getTenantIdFromRequest(req);
  const settings = await loadSettings(tenantId);
  // API 키 상태를 안전하게 노출 (키 값 자체는 노출하지 않음)
  const apiKeyStatus = process.env.ANTHROPIC_API_KEY
    ? { configured: true, masked: "sk-..." + process.env.ANTHROPIC_API_KEY.slice(-4) }
    : { configured: false, masked: null };
  const claudeMode = process.env.CLAUDE_CODE_MODE ?? "api";
  return Response.json({ settings, apiKeyStatus, claudeMode });
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const tenantId = getTenantIdFromRequest(req);
  const current = await loadSettings(tenantId);
  const body = await req.json();
  const parsed = updateSettingsSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.validationError("Invalid input", parsed.error.flatten());
  }
  const validatedBody = parsed.data;
  const updated: AppSettings = {
    ...current,
    ...validatedBody,
    agentModels: { ...current.agentModels, ...(validatedBody.agentModels ?? {}) },
    updatedAt: new Date().toISOString(),
  };
  const docsDir = path.dirname(getTenantSettingsPath(tenantId));
  await fsp.mkdir(docsDir, { recursive: true });
  await fsp.writeFile(getTenantSettingsPath(tenantId), JSON.stringify(updated, null, 2));
  return Response.json({ settings: updated });
});
