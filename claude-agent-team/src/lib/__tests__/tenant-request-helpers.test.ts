/**
 * tenant-request-helpers.test.ts — 요청에서 테넌트 컨텍스트 추출 테스트
 *
 * 비유: 호텔 프론트 데스크가 투숙객의 키카드에서 방 번호를 읽는 것.
 * 멀티 테넌트 모드가 아니면 방 번호 없이 통과.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { getTenantIdFromRequest } from "../tenant/request-helpers";

function createMockRequest(headers: Record<string, string> = {}): NextRequest {
  const url = "http://localhost:3000/api/test";
  return new NextRequest(url, { headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getTenantIdFromRequest", () => {
  it("멀티 테넌트 비활성 → undefined 반환", () => {
    delete process.env.MULTI_TENANT_MODE;
    const req = createMockRequest({ "x-tenant-id": "some-id" });
    expect(getTenantIdFromRequest(req)).toBeUndefined();
  });

  it("멀티 테넌트 활성 + 헤더 있음 → tenantId 반환", () => {
    vi.stubEnv("MULTI_TENANT_MODE", "true");
    const tenantId = "550e8400-e29b-41d4-a716-446655440000";
    const req = createMockRequest({ "x-tenant-id": tenantId });
    expect(getTenantIdFromRequest(req)).toBe(tenantId);
  });

  it("멀티 테넌트 활성 + 헤더 없음 → undefined 반환", () => {
    vi.stubEnv("MULTI_TENANT_MODE", "true");
    const req = createMockRequest();
    expect(getTenantIdFromRequest(req)).toBeUndefined();
  });

  it("MULTI_TENANT_MODE='false' → undefined 반환", () => {
    vi.stubEnv("MULTI_TENANT_MODE", "false");
    const req = createMockRequest({ "x-tenant-id": "some-id" });
    expect(getTenantIdFromRequest(req)).toBeUndefined();
  });
});
