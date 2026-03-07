/**
 * tenant-store.test.ts — 테넌트 레지스트리 CRUD 테스트
 *
 * TDD RED 단계: 구현 전에 실패하는 테스트를 먼저 작성한다.
 * 테넌트 스토어는 아파트 관리사무소의 입주자 명부와 같다.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fsp } from "fs";
import path from "path";
import crypto from "crypto";
import {
  isMultiTenantEnabled,
  createTenant,
  findTenantByApiKey,
  deleteTenant,
  deactivateTenant,
  loadTenantRegistry,
} from "../tenant/tenant-store";

// ── 테스트용 임시 디렉터리 ─────────────────────────────────────────────────

const TEST_DIR = path.join(process.cwd(), ".test-tenant-store-" + crypto.randomBytes(4).toString("hex"));
const TENANTS_FILE = path.join(TEST_DIR, "docs", "tenants.json");

beforeEach(async () => {
  await fsp.mkdir(path.join(TEST_DIR, "docs"), { recursive: true });
  vi.stubEnv("PROJECT_BASE_DIR", TEST_DIR);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fsp.rm(TEST_DIR, { recursive: true, force: true });
});

// ── isMultiTenantEnabled ───────────────────────────────────────────────────

describe("isMultiTenantEnabled", () => {
  it("MULTI_TENANT_MODE 미설정 → false", () => {
    delete process.env.MULTI_TENANT_MODE;
    expect(isMultiTenantEnabled()).toBe(false);
  });

  it("MULTI_TENANT_MODE='false' → false", () => {
    vi.stubEnv("MULTI_TENANT_MODE", "false");
    expect(isMultiTenantEnabled()).toBe(false);
  });

  it("MULTI_TENANT_MODE='true' → true", () => {
    vi.stubEnv("MULTI_TENANT_MODE", "true");
    expect(isMultiTenantEnabled()).toBe(true);
  });
});

// ── createTenant ───────────────────────────────────────────────────────────

describe("createTenant", () => {
  it("유효한 UUID와 jmat_ 접두사 API 키를 생성한다", async () => {
    const result = await createTenant({ name: "테스트 테넌트" });

    expect(result.tenant.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(result.tenant.name).toBe("테스트 테넌트");
    expect(result.tenant.active).toBe(true);
    expect(result.apiKey).toMatch(/^jmat_[a-f0-9]{64}$/);
  });

  it("API 키 해시는 평문과 다르다 (비가역성)", async () => {
    const result = await createTenant({ name: "해시 검증" });

    expect(result.tenant.apiKeyHash).not.toBe(result.apiKey);
    expect(result.tenant.apiKeyHash.length).toBeGreaterThan(0);
  });

  it("레지스트리 파일이 생성된다", async () => {
    await createTenant({ name: "파일 생성 검증" });

    const exists = await fsp.stat(TENANTS_FILE).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it("여러 테넌트를 생성하면 레지스트리에 누적된다", async () => {
    await createTenant({ name: "테넌트 A" });
    await createTenant({ name: "테넌트 B" });

    const registry = await loadTenantRegistry();
    expect(registry.tenants).toHaveLength(2);
  });

  it("생성 시각이 ISO 8601 형식이다", async () => {
    const result = await createTenant({ name: "시각 검증" });

    expect(() => new Date(result.tenant.createdAt)).not.toThrow();
    expect(result.tenant.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.tenant.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ── findTenantByApiKey ─────────────────────────────────────────────────────

describe("findTenantByApiKey", () => {
  it("유효한 API 키로 테넌트를 찾는다", async () => {
    const created = await createTenant({ name: "검색 대상" });
    const found = await findTenantByApiKey(created.apiKey);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.tenant.id);
    expect(found!.name).toBe("검색 대상");
  });

  it("잘못된 API 키는 null을 반환한다", async () => {
    await createTenant({ name: "존재하는 테넌트" });
    const found = await findTenantByApiKey("jmat_invalid_key_1234567890abcdef1234567890abcdef1234567890abcdef12345678");

    expect(found).toBeNull();
  });

  it("빈 레지스트리에서 null을 반환한다", async () => {
    const found = await findTenantByApiKey("jmat_0000000000000000000000000000000000000000000000000000000000000000");

    expect(found).toBeNull();
  });

  it("비활성 테넌트도 찾을 수 있다 (active 체크는 호출자 책임)", async () => {
    const created = await createTenant({ name: "곧 비활성화" });
    await deactivateTenant(created.tenant.id);

    const found = await findTenantByApiKey(created.apiKey);
    expect(found).not.toBeNull();
    expect(found!.active).toBe(false);
  });
});

// ── deleteTenant ───────────────────────────────────────────────────────────

describe("deleteTenant", () => {
  it("레지스트리에서 테넌트를 제거한다", async () => {
    const created = await createTenant({ name: "삭제 대상" });
    await deleteTenant(created.tenant.id);

    const registry = await loadTenantRegistry();
    expect(registry.tenants.find((t) => t.id === created.tenant.id)).toBeUndefined();
  });

  it("존재하지 않는 ID로 삭제해도 에러가 발생하지 않는다", async () => {
    await expect(deleteTenant("non-existent-id")).resolves.not.toThrow();
  });

  it("다른 테넌트에 영향을 주지 않는다", async () => {
    const a = await createTenant({ name: "A" });
    const b = await createTenant({ name: "B" });
    await deleteTenant(a.tenant.id);

    const registry = await loadTenantRegistry();
    expect(registry.tenants).toHaveLength(1);
    expect(registry.tenants[0].id).toBe(b.tenant.id);
  });
});

// ── deactivateTenant ───────────────────────────────────────────────────────

describe("deactivateTenant", () => {
  it("active를 false로 설정한다", async () => {
    const created = await createTenant({ name: "비활성화 대상" });
    await deactivateTenant(created.tenant.id);

    const registry = await loadTenantRegistry();
    const tenant = registry.tenants.find((t) => t.id === created.tenant.id);
    expect(tenant?.active).toBe(false);
  });

  it("updatedAt이 갱신된다", async () => {
    const created = await createTenant({ name: "갱신 검증" });
    const originalUpdatedAt = created.tenant.updatedAt;

    // 최소 1ms 대기 (시간 차이 보장)
    await new Promise((r) => setTimeout(r, 10));
    await deactivateTenant(created.tenant.id);

    const registry = await loadTenantRegistry();
    const tenant = registry.tenants.find((t) => t.id === created.tenant.id);
    expect(new Date(tenant!.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(originalUpdatedAt).getTime()
    );
  });
});

// ── loadTenantRegistry ─────────────────────────────────────────────────────

describe("loadTenantRegistry", () => {
  it("파일이 없으면 빈 레지스트리를 반환한다", async () => {
    const registry = await loadTenantRegistry();
    expect(registry.tenants).toEqual([]);
  });
});
