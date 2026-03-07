/**
 * file-custom-agent-repository.ts — 파일 기반 커스텀 에이전트 저장소
 *
 * 기존 custom-agent-store.ts를 CustomAgentRepository 인터페이스로 래핑한다.
 */

import type {
  CustomAgentData,
  CreateCustomAgentRepoInput,
  UpdateCustomAgentRepoInput,
  CustomAgentRepository,
} from "./types";
import {
  listCustomAgents,
  getCustomAgent,
  createCustomAgent,
  updateCustomAgent,
  deleteCustomAgent,
} from "@/lib/custom-agent-store";

function toCustomAgentData(agent: {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  model: string;
  systemPrompt: string;
  createdAt: string;
  updatedAt: string;
}): CustomAgentData {
  return { ...agent };
}

export class FileCustomAgentRepository implements CustomAgentRepository {
  async findAll(): Promise<CustomAgentData[]> {
    const agents = await listCustomAgents();
    return agents.map(toCustomAgentData);
  }

  async findById(id: string): Promise<CustomAgentData | null> {
    const agent = await getCustomAgent(id);
    return agent ? toCustomAgentData(agent) : null;
  }

  async create(data: CreateCustomAgentRepoInput): Promise<CustomAgentData> {
    const agent = await createCustomAgent({
      id: data.id,
      name: data.name,
      icon: data.icon ?? "🤖",
      color: data.color ?? "#6B7280",
      description: data.description ?? "",
      model: data.model ?? "sonnet",
      systemPrompt: data.systemPrompt,
    });
    return toCustomAgentData(agent);
  }

  async update(id: string, data: UpdateCustomAgentRepoInput): Promise<CustomAgentData> {
    const agent = await updateCustomAgent(id, data);
    return toCustomAgentData(agent);
  }

  async delete(id: string): Promise<void> {
    await deleteCustomAgent(id);
  }
}
