/**
 * 요청에서 테넌트 컨텍스트를 추출하는 헬퍼
 *
 * 비유: 호텔 프론트 데스크가 투숙객의 키카드에서 방 번호를 읽는 것.
 * 멀티 테넌트 모드가 아니면 방 번호 없이 통과 (= 단독 주택 모드).
 */

import { NextRequest } from "next/server";
import { isMultiTenantEnabled } from "./tenant-store";

/**
 * NextRequest에서 tenantId를 추출합니다.
 * 멀티 테넌트 모드가 아니면 항상 undefined를 반환합니다.
 *
 * tenantId는 server.ts에서 API 키 검증 후 x-tenant-id 헤더에 주입됩니다.
 */
export function getTenantIdFromRequest(req: NextRequest): string | undefined {
  if (!isMultiTenantEnabled()) return undefined;
  return req.headers.get("x-tenant-id") ?? undefined;
}
