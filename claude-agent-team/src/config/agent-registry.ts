/**
 * agent-registry.ts — 내장 + 커스텀 에이전트 통합 조회
 *
 * 비유: 정규직(내장) + 계약직(커스텀) 전화번호부.
 * 내장 에이전트는 AGENTS_CONFIG에서, 커스텀은 파일 스토어에서 조회하여
 * 하나의 통합 인터페이스로 제공한다.
 */
import { AGENTS_CONFIG, AGENT_SYSTEM_PROMPTS } from "./agents";
import { listCustomAgents, getCustomAgent } from "@/lib/custom-agent-store";
import type { CustomAgentConfig } from "@/types/custom-agent";
import type { BuiltinAgentId } from "@/types";

/** 에이전트 config 공통 형태 (내장/커스텀 모두) */
export interface AgentConfigLike {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly color: string;
  readonly description: string;
  readonly model: string;
  readonly isCustom?: boolean;
}

// 커스텀 에이전트 캐시 (서버 메모리)
let customAgentCache: Map<string, CustomAgentConfig> = new Map();

/** 커스텀 에이전트 캐시 갱신 */
export async function refreshCustomAgentCache(): Promise<void> {
  const agents = await listCustomAgents();
  const newCache = new Map<string, CustomAgentConfig>();
  for (const agent of agents) {
    newCache.set(agent.id, agent);
  }
  customAgentCache = newCache;
}

/** 에이전트 config 조회 (내장 → 커스텀 순서) */
export async function getAgentConfig(agentId: string): Promise<AgentConfigLike | null> {
  // 1. 내장 에이전트 확인
  if (agentId in AGENTS_CONFIG) {
    const config = AGENTS_CONFIG[agentId as BuiltinAgentId];
    return { ...config, isCustom: false };
  }

  // 2. 캐시에서 커스텀 에이전트 확인
  const cached = customAgentCache.get(agentId);
  if (cached) {
    return { ...cached, isCustom: true };
  }

  // 3. 캐시 미스 시 직접 조회
  const custom = await getCustomAgent(agentId);
  if (custom) {
    customAgentCache.set(agentId, custom);
    return { ...custom, isCustom: true };
  }

  return null;
}

/** 에이전트 시스템 프롬프트 조회 */
export async function getAgentSystemPrompt(agentId: string): Promise<string> {
  // 1. 내장 프롬프트
  if (agentId in AGENT_SYSTEM_PROMPTS) {
    return AGENT_SYSTEM_PROMPTS[agentId as BuiltinAgentId];
  }

  // 2. 커스텀 에이전트 systemPrompt
  const cached = customAgentCache.get(agentId);
  if (cached) return cached.systemPrompt;

  const custom = await getCustomAgent(agentId);
  if (custom) {
    customAgentCache.set(agentId, custom);
    return custom.systemPrompt;
  }

  return "한국어로 응답하세요.";
}

/** 모든 에이전트 config 반환 (내장 + 커스텀 머지) */
export async function getAllAgentConfigs(): Promise<AgentConfigLike[]> {
  // 캐시가 비어있으면 갱신
  if (customAgentCache.size === 0) {
    await refreshCustomAgentCache();
  }

  const builtinConfigs: AgentConfigLike[] = Object.values(AGENTS_CONFIG).map((c) => ({
    ...c,
    isCustom: false,
  }));

  const customConfigs: AgentConfigLike[] = Array.from(customAgentCache.values()).map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    color: c.color,
    description: c.description,
    model: c.model,
    isCustom: true,
  }));

  return [...builtinConfigs, ...customConfigs];
}

/** 커스텀 에이전트 ID 목록 반환 (라우터 validAgents 확장용) */
export function getCustomAgentIds(): string[] {
  return Array.from(customAgentCache.keys());
}
