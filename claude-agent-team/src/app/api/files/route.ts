import { NextRequest } from "next/server";
import { promises as fsp } from "fs";
import path from "path";
import { getProjectBase } from "@/lib/utils/env";
import { withErrorHandler } from "@/lib/api-handler";
import { AppError } from "@/lib/errors";
import { updateFileSchema, readDirSchema } from "@/lib/schemas";
import { getTenantIdFromRequest } from "@/lib/tenant/request-helpers";
import { isMultiTenantEnabled } from "@/lib/tenant/tenant-store";
import { resolveSafePath as resolvePathSafe } from "@/lib/path-security";

/**
 * 경로 안전 검증 (PROJECT_BASE_DIR 외부 접근 차단)
 * 공유 유틸리티 래퍼: 멀티 테넌트 모드에 따라 base를 결정
 */
function resolveSafePath(filePath: string, tenantId?: string): string {
  const projectBase = getProjectBase();
  const base = isMultiTenantEnabled() && tenantId
    ? path.join(projectBase, "docs", tenantId)
    : projectBase;
  return resolvePathSafe(filePath, base);
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const tenantId = getTenantIdFromRequest(req);
  const { searchParams } = new URL(req.url);
  const filePath = searchParams.get("path");
  if (!filePath) {
    throw AppError.badRequest("path required");
  }
  try {
    const fullPath = resolveSafePath(filePath, tenantId);
    const content = await fsp.readFile(fullPath, "utf-8");
    const stat = await fsp.stat(fullPath);
    return Response.json({ content, path: filePath, size: stat.size, mtime: stat.mtime });
  } catch (e) {
    if (e instanceof AppError) throw e;
    return Response.json({ content: "", error: String(e) });
  }
});

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const tenantId = getTenantIdFromRequest(req);
  const body = await req.json();
  const parsed = updateFileSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.validationError("Invalid input", parsed.error.flatten());
  }
  const { path: filePath, content } = parsed.data;
  const fullPath = resolveSafePath(filePath, tenantId);
  await fsp.mkdir(path.dirname(fullPath), { recursive: true });
  await fsp.writeFile(fullPath, content, "utf-8");
  return Response.json({ ok: true, path: filePath });
});

// 디렉터리 트리 조회 (파일 탐색기용)
export const POST = withErrorHandler(async (req: NextRequest) => {
  const tenantId = getTenantIdFromRequest(req);
  const body = await req.json();
  const parsed = readDirSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.validationError("Invalid input", parsed.error.flatten());
  }
  const { dir, depth } = parsed.data;
  const projectBase = getProjectBase();
  const base = isMultiTenantEnabled() && tenantId
    ? path.join(projectBase, "docs", tenantId)
    : projectBase;

  async function readDir(dirPath: string, currentDepth: number): Promise<unknown[]> {
    if (currentDepth <= 0) return [];
    const IGNORE = new Set(["node_modules", ".next", ".git", "dist", "out", ".agent-temp"]);
    try {
      const entries = await fsp.readdir(dirPath, { withFileTypes: true });
      const result = [];
      for (const entry of entries) {
        if (IGNORE.has(entry.name)) continue;
        const fullPath = path.join(dirPath, entry.name);
        const relPath = path.relative(base, fullPath).replace(/\\/g, "/");
        if (entry.isDirectory()) {
          result.push({
            name: entry.name,
            path: relPath,
            type: "dir",
            children: await readDir(fullPath, currentDepth - 1),
          });
        } else {
          result.push({ name: entry.name, path: relPath, type: "file" });
        }
      }
      return result.sort((a: any, b: any) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === "dir" ? -1 : 1;
      });
    } catch {
      return [];
    }
  }

  const targetPath = dir ? resolvePathSafe(dir, base) : base;
  const tree = await readDir(targetPath, depth);
  return Response.json({ tree, base: base.replace(/\\/g, "/") });
});
