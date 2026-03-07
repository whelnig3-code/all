/**
 * GET /api/auth/mode — 인증 모드 감지
 *
 * 프론트엔드가 어떤 로그인 폼을 보여줄지 결정하는 데 사용.
 * 비유: 아파트 입구에서 "이 건물은 카드키가 필요한가요?" 확인하는 안내판.
 */
import { isMultiTenantEnabled } from "@/lib/tenant/tenant-store";

export async function GET() {
  return Response.json({
    multiTenant: isMultiTenantEnabled(),
  });
}
