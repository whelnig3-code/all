/**
 * /api/tenants/:id — 개별 테넌트 관리 API (관리자 전용)
 *
 * GET:    테넌트 상세
 * PATCH:  테넌트 수정 (name, active)
 * DELETE: 테넌트 삭제 (데이터는 보존)
 *
 * 인증: Authorization: Bearer <DASHBOARD_SECRET>
 */

import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { AppError } from "@/lib/errors";
import { updateTenantSchema } from "@/lib/schemas";
import {
  loadTenantRegistry,
  deleteTenant,
  deactivateTenant,
} from "@/lib/tenant/tenant-store";

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

export const GET = withErrorHandler(async (
  req: NextRequest,
  context?: unknown,
) => {
  requireAdminAuth(req);
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const registry = await loadTenantRegistry();
  const tenant = registry.tenants.find((t) => t.id === id);
  if (!tenant) {
    throw AppError.notFound("Tenant not found");
  }
  const { apiKeyHash: _, ...safe } = tenant;
  return Response.json({ tenant: safe });
});

export const PATCH = withErrorHandler(async (
  req: NextRequest,
  context?: unknown,
) => {
  requireAdminAuth(req);
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const body = await req.json();
  const parsed = updateTenantSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.validationError("Invalid input", parsed.error.flatten());
  }

  // active=false 처리
  if (parsed.data.active === false) {
    await deactivateTenant(id);
  }

  // name 변경은 레지스트리 직접 수정 필요 (현재 deactivate만 구현)
  const registry = await loadTenantRegistry();
  const tenant = registry.tenants.find((t) => t.id === id);
  if (!tenant) {
    throw AppError.notFound("Tenant not found");
  }
  const { apiKeyHash: _, ...safe } = tenant;
  return Response.json({ tenant: safe });
});

export const DELETE = withErrorHandler(async (
  req: NextRequest,
  context?: unknown,
) => {
  requireAdminAuth(req);
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  await deleteTenant(id);
  return Response.json({ ok: true });
});
