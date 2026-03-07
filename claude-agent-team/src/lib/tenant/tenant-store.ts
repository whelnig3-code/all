/**
 * tenant-store.ts — 테넌트 레지스트리 파일 기반 저장소
 *
 * 비유: 아파트 관리사무소의 입주자 명부.
 * 입주자 등록(createTenant), 퇴거(deleteTenant), 정지(deactivateTenant),
 * 출입키 확인(findTenantByApiKey)을 관리한다.
 *
 * 저장 위치: docs/tenants.json
 * API 키 형식: jmat_ + 64자 hex (32바이트)
 * 해시 방식: SHA-256 (평문 저장 금지)
 */

import { promises as fsp } from "fs";
import path from "path";
import crypto from "crypto";
import { getProjectBase } from "@/lib/utils/env";
import type {
  TenantData,
  TenantRegistry,
  CreateTenantInput,
  CreateTenantResult,
} from "./types";

// ── 상수 ──────────────────────────────────────────────────────────────────

const API_KEY_PREFIX = "jmat_";
const API_KEY_BYTES = 32; // 64자 hex

// ── 경로 헬퍼 ─────────────────────────────────────────────────────────────

function getTenantsFilePath(): string {
  return path.join(getProjectBase(), "docs", "tenants.json");
}

// ── 해시 유틸리티 ─────────────────────────────────────────────────────────

function hashApiKey(apiKey: string): string {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

function generateApiKey(): string {
  const random = crypto.randomBytes(API_KEY_BYTES).toString("hex");
  return `${API_KEY_PREFIX}${random}`;
}

// ── 모드 확인 ─────────────────────────────────────────────────────────────

/** 멀티 테넌트 모드가 활성화되었는지 확인 */
export function isMultiTenantEnabled(): boolean {
  return process.env.MULTI_TENANT_MODE === "true";
}

// ── 레지스트리 읽기/쓰기 ──────────────────────────────────────────────────

/** 레지스트리 파일에서 테넌트 목록을 로드 (파일 없으면 빈 배열) */
export async function loadTenantRegistry(): Promise<TenantRegistry> {
  try {
    const raw = await fsp.readFile(getTenantsFilePath(), "utf-8");
    return JSON.parse(raw) as TenantRegistry;
  } catch {
    return { tenants: [] };
  }
}

/** 레지스트리를 파일에 저장 (불변 패턴: 전체 교체) */
async function saveTenantRegistry(registry: TenantRegistry): Promise<void> {
  const filePath = getTenantsFilePath();
  const dir = path.dirname(filePath);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(filePath, JSON.stringify(registry, null, 2), "utf-8");
}

// ── CRUD 함수 ─────────────────────────────────────────────────────────────

/** 새 테넌트를 생성하고 API 키를 반환 (평문은 이 1회만 제공) */
export async function createTenant(input: CreateTenantInput): Promise<CreateTenantResult> {
  const apiKey = generateApiKey();
  const now = new Date().toISOString();

  const tenant: TenantData = {
    id: crypto.randomUUID(),
    name: input.name,
    apiKeyHash: hashApiKey(apiKey),
    createdAt: now,
    updatedAt: now,
    active: true,
  };

  const registry = await loadTenantRegistry();
  const updated: TenantRegistry = {
    tenants: [...registry.tenants, tenant],
  };
  await saveTenantRegistry(updated);

  return { tenant, apiKey };
}

/** API 키로 테넌트를 검색 (해시 비교) */
export async function findTenantByApiKey(apiKey: string): Promise<TenantData | null> {
  const registry = await loadTenantRegistry();
  const hash = hashApiKey(apiKey);

  return registry.tenants.find((t) => t.apiKeyHash === hash) ?? null;
}

/** 테넌트를 레지스트리에서 제거 (데이터 디렉터리는 보존) */
export async function deleteTenant(tenantId: string): Promise<void> {
  const registry = await loadTenantRegistry();
  const updated: TenantRegistry = {
    tenants: registry.tenants.filter((t) => t.id !== tenantId),
  };
  await saveTenantRegistry(updated);
}

/** 테넌트를 비활성화 (active=false, updatedAt 갱신) */
export async function deactivateTenant(tenantId: string): Promise<void> {
  const registry = await loadTenantRegistry();
  const now = new Date().toISOString();
  const updated: TenantRegistry = {
    tenants: registry.tenants.map((t) =>
      t.id === tenantId ? { ...t, active: false, updatedAt: now } : t
    ),
  };
  await saveTenantRegistry(updated);
}
