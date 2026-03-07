import Anthropic from "@anthropic-ai/sdk";
import { AgentId } from "@/types";
import { promises as fsp } from "fs";
import path from "path";
import { getProjectBase } from "@/lib/utils/env";
import { resolveSafePath } from "@/lib/path-security";

// ─── 에이전트별 도구 정의 ──────────────────────────────────────────────────────

// 모든 에이전트에게 공통으로 제공되는 도구
const COMMON_TOOLS: Anthropic.Tool[] = [
  {
    name: "read_file",
    description: "파일 내용을 읽습니다.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "읽을 파일의 경로 (절대 경로 또는 프로젝트 루트 기준 상대 경로)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "파일에 내용을 씁니다. 파일이 없으면 생성합니다.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "쓸 파일의 경로",
        },
        content: {
          type: "string",
          description: "파일에 쓸 내용",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "list_files",
    description: "디렉토리의 파일 목록을 조회합니다.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "조회할 디렉토리 경로 (기본값: 프로젝트 루트)",
        },
      },
      required: [],
    },
  },
];

// 에이전트 ID별 도구 세트 (빈 배열 = 도구 없음, undefined = 공통 도구 사용)
const AGENT_TOOLS: Partial<Record<AgentId, Anthropic.Tool[]>> = {
  // 개발자: 파일 읽기/쓰기 도구
  developer: COMMON_TOOLS,
  // 플래너: 파일 읽기만
  planner: [COMMON_TOOLS[0], COMMON_TOOLS[2]],
  // 리뷰어: 파일 읽기만
  reviewer: [COMMON_TOOLS[0], COMMON_TOOLS[2]],
  // 나머지 에이전트: 도구 없음 (Claude CLI가 직접 처리)
  writer: [],
  "security-auditor": [COMMON_TOOLS[0]],
  researcher: [],
  designer: [],
};

/**
 * 에이전트 ID에 해당하는 도구 목록 반환
 * SDK 모드에서는 Claude CLI가 자체적으로 도구를 처리하므로 빈 배열 반환
 */
export function getAgentTools(agentId: AgentId): Anthropic.Tool[] {
  // SDK 모드에서는 도구를 API로 전달하지 않음 (CLI가 처리)
  if (
    process.env.CLAUDE_CODE_MODE === "sdk" ||
    !process.env.ANTHROPIC_API_KEY
  ) {
    return [];
  }

  return AGENT_TOOLS[agentId] ?? [];
}

/**
 * 도구 실행 핸들러
 */
export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<string> {
  const base = getProjectBase();

  try {
    switch (toolName) {
      case "read_file": {
        const filePath = toolInput.path as string;
        const fullPath = resolveSafePath(filePath, base);
        const content = await fsp.readFile(fullPath, "utf-8");
        return content;
      }

      case "write_file": {
        const filePath = toolInput.path as string;
        const content = toolInput.content as string;
        const fullPath = resolveSafePath(filePath, base);
        await fsp.mkdir(path.dirname(fullPath), { recursive: true });
        await fsp.writeFile(fullPath, content, "utf-8");
        return `파일 저장 완료: ${filePath}`;
      }

      case "list_files": {
        const dirPath = (toolInput.path as string) || ".";
        const fullPath = resolveSafePath(dirPath, base);
        const entries = await fsp.readdir(fullPath, { withFileTypes: true });
        const list = entries
          .map((e) => `${e.isDirectory() ? "[DIR]" : "[FILE]"} ${e.name}`)
          .join("\n");
        return list || "(비어 있음)";
      }

      default:
        return `알 수 없는 도구: ${toolName}`;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `도구 실행 오류 (${toolName}): ${msg}`;
  }
}
