/**
 * custom-agent-store.ts — 커스텀 에이전트 파일 기반 CRUD
 *
 * 비유: 고정 배우 명단(AGENTS_CONFIG)에 추가되는 임시 배우 서류함.
 * 각 배우의 프로필은 `data/custom-agents/{id}.json`에 개별 보관된다.
 */
import { promises as fsp } from "fs";
import path from "path";
import { BUILTIN_AGENT_IDS, createCustomAgentSchema } from "@/lib/schemas/agents";
import type {
  CustomAgentConfig,
  CreateCustomAgentInput,
  UpdateCustomAgentInput,
} from "@/types/custom-agent";

const CUSTOM_AGENTS_DIR = path.join(process.cwd(), "data", "custom-agents");

/** 디렉터리가 없으면 생성 */
async function ensureDir(): Promise<void> {
  await fsp.mkdir(CUSTOM_AGENTS_DIR, { recursive: true });
}

/** 에이전트 파일 경로 */
function agentFilePath(id: string): string {
  return path.join(CUSTOM_AGENTS_DIR, `${id}.json`);
}

/** Atomic write: tmp → rename */
async function atomicWrite(filePath: string, data: string): Promise<void> {
  const tmpPath = `${filePath}.${Date.now()}.tmp`;
  await fsp.writeFile(tmpPath, data, "utf-8");
  await fsp.rename(tmpPath, filePath);
}

/** 모든 커스텀 에이전트 목록 조회 */
export async function listCustomAgents(): Promise<CustomAgentConfig[]> {
  await ensureDir();
  const files = await fsp.readdir(CUSTOM_AGENTS_DIR);
  const agents: CustomAgentConfig[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fsp.readFile(path.join(CUSTOM_AGENTS_DIR, file), "utf-8");
      agents.push(JSON.parse(raw));
    } catch { /* skip corrupted files */ }
  }

  return agents;
}

/** 단일 커스텀 에이전트 조회 */
export async function getCustomAgent(id: string): Promise<CustomAgentConfig | null> {
  try {
    const raw = await fsp.readFile(agentFilePath(id), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** 커스텀 에이전트 생성 */
export async function createCustomAgent(
  input: CreateCustomAgentInput,
): Promise<CustomAgentConfig> {
  await ensureDir();

  // ID 형식 검증
  const parsed = createCustomAgentSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`유효하지 않은 입력: ${parsed.error.issues[0]?.message}`);
  }

  // 내장 에이전트 ID 충돌 검사
  if ((BUILTIN_AGENT_IDS as readonly string[]).includes(input.id)) {
    throw new Error(`내장 에이전트 ID와 충돌: ${input.id}`);
  }

  // 중복 ID 검사
  const existing = await getCustomAgent(input.id);
  if (existing) {
    throw new Error(`이미 존재하는 에이전트 ID: ${input.id}`);
  }

  const now = new Date().toISOString();
  const agent: CustomAgentConfig = {
    id: input.id,
    name: input.name,
    icon: input.icon,
    color: input.color,
    description: input.description,
    model: input.model,
    systemPrompt: input.systemPrompt,
    createdAt: now,
    updatedAt: now,
  };

  await atomicWrite(agentFilePath(input.id), JSON.stringify(agent, null, 2));
  return agent;
}

/** 커스텀 에이전트 수정 (immutable — 새 객체 생성) */
export async function updateCustomAgent(
  id: string,
  input: UpdateCustomAgentInput,
): Promise<CustomAgentConfig> {
  const existing = await getCustomAgent(id);
  if (!existing) {
    throw new Error(`에이전트를 찾을 수 없음: ${id}`);
  }

  const updated: CustomAgentConfig = {
    ...existing,
    ...input,
    id: existing.id, // ID는 변경 불가
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  await atomicWrite(agentFilePath(id), JSON.stringify(updated, null, 2));
  return updated;
}

/** 커스텀 에이전트 삭제 */
export async function deleteCustomAgent(id: string): Promise<void> {
  try {
    await fsp.unlink(agentFilePath(id));
  } catch {
    throw new Error(`에이전트를 찾을 수 없음: ${id}`);
  }
}
