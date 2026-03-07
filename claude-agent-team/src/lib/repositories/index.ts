/**
 * Repository barrel export.
 *
 * All repository interfaces and file-based implementations are exported
 * from here. When migrating to Prisma, add Prisma implementations and
 * update the factory functions to return them instead.
 */

// ── Interfaces (contract) ───────────────────────────────────────────────────
export type {
  // Data shapes
  ConversationSummary,
  ConversationDetail,
  MessageData,
  ProjectData,
  WorkflowData,
  TodoData,
  AgentStatData,
  AgentMemoryData,
  // Input shapes
  CreateConversationInput,
  UpdateConversationInput,
  CreateMessageInput,
  CreateProjectInput,
  UpdateProjectInput,
  CreateWorkflowInput,
  UpdateWorkflowInput,
  CreateTodoInput,
  UpdateTodoInput,
  UpsertAgentStatInput,
  UpsertAgentMemoryInput,
  // Query options
  ConversationQueryOptions,
  AgentStatQueryOptions,
  // Custom agent types
  CustomAgentData,
  CreateCustomAgentRepoInput,
  UpdateCustomAgentRepoInput,
  // Repository interfaces
  ConversationRepository,
  MessageRepository,
  ProjectRepository,
  WorkflowRepository,
  TodoRepository,
  AgentStatRepository,
  AgentMemoryRepository,
  CustomAgentRepository,
} from "./types";

// ── File-based implementations ──────────────────────────────────────────────
export { FileConversationRepository } from "./file-conversation-repository";
export { FileMessageRepository } from "./file-message-repository";
export { FileCustomAgentRepository } from "./file-custom-agent-repository";

// ── Repository factory ──────────────────────────────────────────────────────
export {
  getConversationRepository,
  getMessageRepository,
  getCustomAgentRepository,
  clearRepositoryCache,
  type StorageBackend,
} from "./repository-factory";
