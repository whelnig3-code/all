/**
 * tenant-paths.test.ts — 테넌트별 경로 해석 테스트
 *
 * 비유: 단독 주택(단일 테넌트)에서는 우편함이 하나.
 * 아파트(멀티 테넌트)에서는 동/호수별 우편함이 분리된다.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fsp } from "fs";
import path from "path";
import crypto from "crypto";
import {
  getTenantConversationsDir,
  getTenantProjectsDir,
  getTenantWorkflowsDir,
  getTenantTodosFile,
  getTenantSettingsPath,
  getTenantMemoryDir,
  getTenantHandoffsDir,
  ensureTenantDirs,
  validateTenantId,
} from "../tenant/tenant-paths";

const TEST_DIR = path.join(process.cwd(), ".test-tenant-paths-" + crypto.randomBytes(4).toString("hex"));

beforeEach(async () => {
  await fsp.mkdir(path.join(TEST_DIR, "docs"), { recursive: true });
  vi.stubEnv("PROJECT_BASE_DIR", TEST_DIR);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fsp.rm(TEST_DIR, { recursive: true, force: true });
});

// ── 단일 테넌트 모드 (MULTI_TENANT_MODE 미설정) ─────────────────────────────

describe("단일 테넌트 모드", () => {
  beforeEach(() => {
    delete process.env.MULTI_TENANT_MODE;
  });

  it("conversations 경로가 기존과 동일하다", () => {
    const dir = getTenantConversationsDir();
    expect(dir).toBe(path.join(TEST_DIR, "docs", "conversations"));
  });

  it("tenantId를 전달해도 무시된다", () => {
    const dir = getTenantConversationsDir("some-tenant-id");
    expect(dir).toBe(path.join(TEST_DIR, "docs", "conversations"));
  });

  it("모든 경로 함수가 기존 paths.ts와 동일한 결과를 반환한다", () => {
    const base = path.join(TEST_DIR, "docs");
    expect(getTenantProjectsDir()).toBe(path.join(base, "projects"));
    expect(getTenantWorkflowsDir()).toBe(path.join(base, "workflows"));
    expect(getTenantTodosFile()).toBe(path.join(base, "todos.json"));
    expect(getTenantSettingsPath()).toBe(path.join(base, "settings.json"));
    expect(getTenantMemoryDir()).toBe(path.join(base, "memory"));
    expect(getTenantHandoffsDir()).toBe(path.join(base, "handoffs"));
  });
});

// ── 멀티 테넌트 모드 ─────────────────────────────────────────────────────

describe("멀티 테넌트 모드", () => {
  const TENANT_ID = "550e8400-e29b-41d4-a716-446655440000";

  beforeEach(() => {
    vi.stubEnv("MULTI_TENANT_MODE", "true");
  });

  it("tenantId가 경로에 포함된다", () => {
    const dir = getTenantConversationsDir(TENANT_ID);
    expect(dir).toBe(path.join(TEST_DIR, "docs", TENANT_ID, "conversations"));
  });

  it("tenantId 없이 호출하면 기존 경로를 반환한다", () => {
    const dir = getTenantConversationsDir();
    expect(dir).toBe(path.join(TEST_DIR, "docs", "conversations"));
  });

  it("모든 경로 함수에 tenantId가 적용된다", () => {
    const base = path.join(TEST_DIR, "docs", TENANT_ID);
    expect(getTenantProjectsDir(TENANT_ID)).toBe(path.join(base, "projects"));
    expect(getTenantWorkflowsDir(TENANT_ID)).toBe(path.join(base, "workflows"));
    expect(getTenantTodosFile(TENANT_ID)).toBe(path.join(base, "todos.json"));
    expect(getTenantSettingsPath(TENANT_ID)).toBe(path.join(base, "settings.json"));
    expect(getTenantMemoryDir(TENANT_ID)).toBe(path.join(base, "memory"));
    expect(getTenantHandoffsDir(TENANT_ID)).toBe(path.join(base, "handoffs"));
  });
});

// ── ensureTenantDirs ─────────────────────────────────────────────────────

describe("ensureTenantDirs", () => {
  const TENANT_ID = "550e8400-e29b-41d4-a716-446655440000";

  beforeEach(() => {
    vi.stubEnv("MULTI_TENANT_MODE", "true");
  });

  it("테넌트용 하위 디렉터리를 모두 생성한다", async () => {
    await ensureTenantDirs(TENANT_ID);

    const base = path.join(TEST_DIR, "docs", TENANT_ID);
    const dirs = ["conversations", "projects", "workflows", "memory", "handoffs"];
    for (const dir of dirs) {
      const stat = await fsp.stat(path.join(base, dir));
      expect(stat.isDirectory()).toBe(true);
    }
  });
});

// ── 보안: 경로 순회 방지 ──────────────────────────────────────────────────

describe("validateTenantId", () => {
  it("유효한 UUID를 허용한다", () => {
    expect(validateTenantId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("경로 순회 문자를 거부한다", () => {
    expect(validateTenantId("../../../etc")).toBe(false);
    expect(validateTenantId("..")).toBe(false);
    expect(validateTenantId("tenant/../admin")).toBe(false);
  });

  it("빈 문자열을 거부한다", () => {
    expect(validateTenantId("")).toBe(false);
  });

  it("UUID가 아닌 문자열을 거부한다", () => {
    expect(validateTenantId("not-a-uuid")).toBe(false);
    expect(validateTenantId("hello world")).toBe(false);
    expect(validateTenantId("12345")).toBe(false);
  });
});
