import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { getTokenDashboardStats } from "@/lib/agent-telemetry";
import { getTenantIdFromRequest } from "@/lib/tenant/request-helpers";

export const GET = withErrorHandler(async (req: NextRequest) => {
  // TODO: 인메모리 통계를 테넌트별로 분리하려면 DB 마이그레이션 필요
  // 현재는 tenantId를 추출만 해두고, 전역 통계를 반환
  const _tenantId = getTenantIdFromRequest(req);
  const stats = getTokenDashboardStats();

  return Response.json(stats);
});
