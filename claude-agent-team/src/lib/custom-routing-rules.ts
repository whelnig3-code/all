/**
 * custom-routing-rules.ts — 사용자 정의 라우팅 규칙 저장소
 *
 * 비유: 도어록 설정판에 사용자가 직접 추가한 출입 규칙.
 * 기본 규칙(하드코딩)은 건물 관리자가 설정한 것이고,
 * 여기서 관리하는 규칙은 입주자가 추가한 커스텀 규칙.
 *
 * 저장: docs/routing-rules.json (파일 기반)
 */

import { promises as fsp } from "fs";
import path from "path";
import { ensureDir } from "@/lib/paths";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("custom-routing-rules");

/** 커스텀 규칙의 직렬화 가능한 형태 (RegExp, 함수 제외) */
export interface CustomRoutingRule {
  readonly id: string;
  readonly priority: number;
  readonly agent: string;
  readonly keywords: string[];
  readonly description: string;
}

const RULES_PATH = path.join(process.cwd(), "docs", "routing-rules.json");

export async function loadCustomRules(): Promise<CustomRoutingRule[]> {
  try {
    const raw = await fsp.readFile(RULES_PATH, "utf-8");
    return JSON.parse(raw) as CustomRoutingRule[];
  } catch {
    return [];
  }
}

export async function saveCustomRules(rules: CustomRoutingRule[]): Promise<void> {
  const dir = path.dirname(RULES_PATH);
  await ensureDir(dir);
  await fsp.writeFile(RULES_PATH, JSON.stringify(rules, null, 2), "utf-8");
  log.info({ count: rules.length }, "Custom routing rules saved");
}

export async function addCustomRule(rule: Omit<CustomRoutingRule, "id">): Promise<CustomRoutingRule> {
  const existing = await loadCustomRules();
  const newRule: CustomRoutingRule = {
    ...rule,
    id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  };
  await saveCustomRules([...existing, newRule]);
  return newRule;
}

export async function updateCustomRule(id: string, updates: Partial<Omit<CustomRoutingRule, "id">>): Promise<boolean> {
  const existing = await loadCustomRules();
  const idx = existing.findIndex((r) => r.id === id);
  if (idx === -1) return false;

  const updated = existing.map((r) =>
    r.id === id ? { ...r, ...updates } : r,
  );
  await saveCustomRules(updated);
  return true;
}

export async function deleteCustomRule(id: string): Promise<boolean> {
  const existing = await loadCustomRules();
  const filtered = existing.filter((r) => r.id !== id);
  if (filtered.length === existing.length) return false;
  await saveCustomRules(filtered);
  return true;
}
