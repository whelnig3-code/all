/**
 * tenant-paths.ts — 테넌트별 경로 해석기
 *
 * 비유: 아파트 우편함 시스템.
 * 단독 주택(단일 테넌트)에서는 주소 = 집 번호.
 * 아파트(멀티 테넌트)에서는 주소 = 동/호수 + 집 번호.
 *
 * 멀티 테넌트 모드: docs/{tenantId}/conversations/
 * 단일 테넌트 모드: docs/conversations/ (기존과 동일)
 */

import path from "path";
import { getProjectBase } from "@/lib/utils/env";
import { isMultiTenantEnabled } from "./tenant-store";
import { ensureDir } from "@/lib/paths";

// ── UUID 형식 검증 ────────────────────────────────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** tenantId가 유효한 UUID 형식인지 검증 (경로 순회 방지) */
export function validateTenantId(tenantId: string): boolean {
  if (!tenantId) return false;
  return UUID_REGEX.test(tenantId);
}

// ── 기본 경로 해석 ────────────────────────────────────────────────────────

function getDocsRoot(tenantId?: string): string {
  const base = path.join(getProjectBase(), "docs");
  if (!isMultiTenantEnabled() || !tenantId) return base;
  return path.join(base, tenantId);
}

// ── 테넌트별 경로 함수 ────────────────────────────────────────────────────

export function getTenantConversationsDir(tenantId?: string): string {
  return path.join(getDocsRoot(tenantId), "conversations");
}

export function getTenantProjectsDir(tenantId?: string): string {
  return path.join(getDocsRoot(tenantId), "projects");
}

export function getTenantWorkflowsDir(tenantId?: string): string {
  return path.join(getDocsRoot(tenantId), "workflows");
}

export function getTenantTodosFile(tenantId?: string): string {
  return path.join(getDocsRoot(tenantId), "todos.json");
}

export function getTenantSettingsPath(tenantId?: string): string {
  return path.join(getDocsRoot(tenantId), "settings.json");
}

export function getTenantMemoryDir(tenantId?: string): string {
  return path.join(getDocsRoot(tenantId), "memory");
}

export function getTenantHandoffsDir(tenantId?: string): string {
  return path.join(getDocsRoot(tenantId), "handoffs");
}

// ── 디렉터리 일괄 생성 ────────────────────────────────────────────────────

/** 테넌트용 하위 디렉터리를 모두 생성 */
export async function ensureTenantDirs(tenantId: string): Promise<void> {
  await Promise.all([
    ensureDir(getTenantConversationsDir(tenantId)),
    ensureDir(getTenantProjectsDir(tenantId)),
    ensureDir(getTenantWorkflowsDir(tenantId)),
    ensureDir(getTenantMemoryDir(tenantId)),
    ensureDir(getTenantHandoffsDir(tenantId)),
  ]);
}
