import { z } from "zod";

/** 내장 에이전트 ID 목록 (타입 가드 및 충돌 검사에 사용) */
export const BUILTIN_AGENT_IDS = [
  "planner",
  "developer",
  "reviewer",
  "writer",
  "security-auditor",
  "researcher",
  "designer",
] as const;

/** 에이전트 토글 스키마 — 내장 + 커스텀 모두 수용 */
export const toggleAgentSchema = z.object({
  agentId: z.string().min(1).max(60),
  active: z.boolean(),
});

/** 커스텀 에이전트 생성 스키마 */
export const createCustomAgentSchema = z.object({
  id: z.string().regex(
    /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/,
    "kebab-case, 3-40자 (소문자, 숫자, 하이픈)",
  ),
  name: z.string().min(1).max(30),
  icon: z.string().min(1).max(4),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "hex 색상 (#RRGGBB)"),
  description: z.string().min(1).max(200),
  model: z.enum(["sonnet", "opus", "haiku"]),
  systemPrompt: z.string().min(10).max(5000),
});

/** 커스텀 에이전트 수정 스키마 (모든 필드 선택적, id 제외) */
export const updateCustomAgentSchema = createCustomAgentSchema
  .omit({ id: true })
  .partial();
