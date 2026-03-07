/**
 * /api/tenants — 테넌트 관리 API (관리자 전용)
 *
 * 비유: 아파트 관리사무소. 입주자 등록/조회는 관리소장(DASHBOARD_SECRET)만 가능.
 *
 * GET:  전체 테넌트 목록
 * POST: 새 테넌트 생성 → API 키 반환 (1회만)
 *
 * 인증: Authorization: Bearer <DASHBOARD_SECRET>
 */

import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { AppError } from "@/lib/errors";
import { createTenantSchema } from "@/lib/schemas";
import { createTenant, loadTenantRegistry } from "@/lib/tenant/tenant-store";
import { ensureTenantDirs } from "@/lib/tenant/tenant-paths";

/** DASHBOARD_SECRET Bearer 토큰 인증 (관리자 전용) */
function requireAdminAuth(req: NextRequest): void {
  const secret = process.env.DASHBOARD_SECRET;
  if (!secret) {
    throw AppError.unauthorized("DASHBOARD_SECRET not configured");
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    throw AppError.unauthorized("Invalid admin credentials");
  }
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  requireAdminAuth(req);
  const registry = await loadTenantRegistry();
  // apiKeyHash는 노출하지 않음
  const tenants = registry.tenants.map(({ apiKeyHash: _, ...rest }) => rest);
  return Response.json({ tenants });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  requireAdminAuth(req);
  const body = await req.json();
  const parsed = createTenantSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.validationError("Invalid input", parsed.error.flatten());
  }

  const result = await createTenant(parsed.data);

  // 테넌트용 디렉터리 구조 생성
  await ensureTenantDirs(result.tenant.id);

  return Response.json(
    {
      tenant: { ...result.tenant, apiKeyHash: undefined },
      apiKey: result.apiKey, // 생성 시 1회만 반환
    },
    { status: 201 }
  );
});
