// 에이전트 장기 메모리 (파일 기반)
// 각 에이전트의 학습 내용을 docs/memory/ 에 저장하여 세션 간에 유지합니다.

import { promises as fsp } from "fs";
import path from "path";
import { AgentId } from "@/types";
import { ensureDir } from "@/lib/paths";
import { getTenantMemoryDir } from "@/lib/tenant/tenant-paths";

function getMemoryPath(agentId: AgentId, tenantId?: string): string {
  return path.join(getTenantMemoryDir(tenantId), `${agentId}.md`);
}

/**
 * 에이전트 메모리 읽기
 * 파일이 없으면 빈 문자열 반환
 */
export async function readAgentMemory(agentId: AgentId, tenantId?: string): Promise<string> {
  try {
    const filePath = getMemoryPath(agentId, tenantId);
    const content = await fsp.readFile(filePath, "utf-8");
    return content;
  } catch {
    return "";
  }
}

/**
 * 에이전트 메모리 업데이트
 * 최근 작업 요약을 추가 형태로 저장
 */
export async function updateAgentMemory(
  agentId: AgentId,
  agentName: string,
  summary: string,
  tenantId?: string,
): Promise<void> {
  try {
    const memDir = getTenantMemoryDir(tenantId);
    await ensureDir(memDir);

    const filePath = getMemoryPath(agentId, tenantId);
    const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");

    // 기존 내용 읽기
    let existing = "";
    try {
      existing = await fsp.readFile(filePath, "utf-8");
    } catch {
      existing = `# ${agentName} 장기 메모리\n\n`;
    }

    // 새 항목 추가 (최신이 앞에 오도록)
    const newEntry = `\n## ${timestamp}\n\n${summary.slice(0, 800)}\n\n---\n`;

    // 총 길이 제한 (10000자 초과 시 오래된 내용 제거)
    let combined = existing + newEntry;
    if (combined.length > 10000) {
      // 헤더 보존 후 나머지 자르기
      const headerEnd = combined.indexOf("\n## ");
      if (headerEnd > 0) {
        const header = combined.slice(0, headerEnd);
        const rest = combined.slice(headerEnd);
        // 최근 8000자만 유지
        combined = header + rest.slice(Math.max(0, rest.length - 8000));
      }
    }

    await fsp.writeFile(filePath, combined, "utf-8");
  } catch {
    // 메모리 저장 실패는 조용히 무시
  }
}
