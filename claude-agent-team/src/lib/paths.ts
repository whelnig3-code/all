/**
 * 프로젝트 디렉터리 경로 헬퍼
 * 6+ route 파일에 중복 정의된 디렉터리 함수를 중앙화합니다.
 */

import path from "path";
import { promises as fsp } from "fs";
import { getProjectBase } from "@/lib/utils/env";

// ─── docs/ 하위 디렉터리 헬퍼 ─────────────────────────────────────────────────

export function getConversationsDir(): string {
  return path.join(getProjectBase(), "docs", "conversations");
}

export function getProjectsDir(): string {
  return path.join(getProjectBase(), "docs", "projects");
}

export function getWorkflowsDir(): string {
  return path.join(getProjectBase(), "docs", "workflows");
}

export function getTodosFile(): string {
  return path.join(getProjectBase(), "docs", "todos.json");
}

export function getSettingsPath(): string {
  return path.join(getProjectBase(), "docs", "settings.json");
}

export function getMemoryDir(): string {
  return path.join(getProjectBase(), "docs", "memory");
}

export function getHandoffsDir(): string {
  return path.join(getProjectBase(), "docs", "handoffs");
}

// ─── 유틸리티 ─────────────────────────────────────────────────────────────────

/** 디렉터리가 없으면 재귀적으로 생성 */
export async function ensureDir(dir: string): Promise<void> {
  await fsp.mkdir(dir, { recursive: true });
}
