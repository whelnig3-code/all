/**
 * Repository pattern interfaces — abstraction over data access.
 *
 * Think of repositories like a library catalog system: you ask the catalog
 * (interface) for a book, and it doesn't matter whether the book is stored
 * in a shelf (file-based) or a digital archive (PostgreSQL). The interface
 * stays the same; only the storage backend changes.
 *
 * Current backend: file-based JSON
 * Future backend:  Prisma/PostgreSQL
 */

// ── Data shapes (read-only, matching existing structures) ───────────────────

export interface ConversationSummary {
  readonly id: string;
  readonly title: string;
  readonly projectId: string | null;
  readonly messageCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ConversationDetail extends ConversationSummary {
  readonly messages: readonly MessageData[];
}

export interface MessageData {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly agentId?: string;
  readonly createdAt: string;
}

export interface ProjectData {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly description: string;
  readonly path: string;
  readonly defaultAgent?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface WorkflowData {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly steps: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TodoData {
  readonly id: string;
  readonly text: string;
  readonly done: boolean;
  readonly priority: "low" | "medium" | "high";
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AgentStatData {
  readonly id: string;
  readonly agentId: string;
  readonly callCount: number;
  readonly totalTokens: number;
  readonly estimatedCost: number;
  readonly date: string;
}

export interface AgentMemoryData {
  readonly id: string;
  readonly agentId: string;
  readonly content: string;
  readonly updatedAt: string;
}

export interface CustomAgentData {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly color: string;
  readonly description: string;
  readonly model: string;
  readonly systemPrompt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ── Input shapes (for create/update operations) ─────────────────────────────

export interface CreateConversationInput {
  readonly title?: string;
  readonly projectId?: string;
}

export interface UpdateConversationInput {
  readonly title?: string;
}

export interface CreateMessageInput {
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly agentId?: string;
}

export interface CreateProjectInput {
  readonly name: string;
  readonly icon?: string;
  readonly description?: string;
  readonly path?: string;
  readonly defaultAgent?: string;
}

export interface UpdateProjectInput {
  readonly name?: string;
  readonly icon?: string;
  readonly description?: string;
  readonly path?: string;
  readonly defaultAgent?: string;
}

export interface CreateWorkflowInput {
  readonly name: string;
  readonly description?: string;
  readonly steps?: readonly string[];
}

export interface UpdateWorkflowInput {
  readonly name?: string;
  readonly description?: string;
  readonly steps?: readonly string[];
}

export interface CreateTodoInput {
  readonly text: string;
  readonly priority?: "low" | "medium" | "high";
}

export interface UpdateTodoInput {
  readonly text?: string;
  readonly done?: boolean;
  readonly priority?: "low" | "medium" | "high";
}

export interface UpsertAgentStatInput {
  readonly agentId: string;
  readonly callCount?: number;
  readonly totalTokens?: number;
  readonly estimatedCost?: number;
  readonly date?: Date;
}

export interface UpsertAgentMemoryInput {
  readonly agentId: string;
  readonly content: string;
}

// ── Query options ───────────────────────────────────────────────────────────

export interface ConversationQueryOptions {
  readonly projectId?: string;
  readonly q?: string;
}

export interface AgentStatQueryOptions {
  readonly agentId?: string;
  readonly startDate?: Date;
  readonly endDate?: Date;
}

// ── Repository interfaces ───────────────────────────────────────────────────

export interface ConversationRepository {
  findAll(options?: ConversationQueryOptions): Promise<ConversationSummary[]>;
  findById(id: string): Promise<ConversationDetail | null>;
  create(data: CreateConversationInput): Promise<ConversationSummary>;
  update(id: string, data: UpdateConversationInput): Promise<ConversationSummary>;
  delete(id: string): Promise<void>;
}

export interface MessageRepository {
  findByConversationId(conversationId: string): Promise<MessageData[]>;
  create(conversationId: string, data: CreateMessageInput): Promise<MessageData>;
}

export interface ProjectRepository {
  findAll(): Promise<ProjectData[]>;
  findById(id: string): Promise<ProjectData | null>;
  create(data: CreateProjectInput): Promise<ProjectData>;
  update(id: string, data: UpdateProjectInput): Promise<ProjectData>;
  delete(id: string): Promise<void>;
}

export interface WorkflowRepository {
  findAll(): Promise<WorkflowData[]>;
  findById(id: string): Promise<WorkflowData | null>;
  create(data: CreateWorkflowInput): Promise<WorkflowData>;
  update(id: string, data: UpdateWorkflowInput): Promise<WorkflowData>;
  delete(id: string): Promise<void>;
}

export interface TodoRepository {
  findAll(): Promise<TodoData[]>;
  findById(id: string): Promise<TodoData | null>;
  create(data: CreateTodoInput): Promise<TodoData>;
  update(id: string, data: UpdateTodoInput): Promise<TodoData>;
  delete(id: string): Promise<void>;
}

export interface AgentStatRepository {
  findAll(options?: AgentStatQueryOptions): Promise<AgentStatData[]>;
  upsert(data: UpsertAgentStatInput): Promise<AgentStatData>;
}

export interface AgentMemoryRepository {
  findByAgentId(agentId: string): Promise<AgentMemoryData | null>;
  upsert(data: UpsertAgentMemoryInput): Promise<AgentMemoryData>;
}

export interface CreateCustomAgentRepoInput {
  readonly id: string;
  readonly name: string;
  readonly icon?: string;
  readonly color?: string;
  readonly description?: string;
  readonly model?: string;
  readonly systemPrompt: string;
}

export interface UpdateCustomAgentRepoInput {
  readonly name?: string;
  readonly icon?: string;
  readonly color?: string;
  readonly description?: string;
  readonly model?: string;
  readonly systemPrompt?: string;
}

export interface CustomAgentRepository {
  findAll(): Promise<CustomAgentData[]>;
  findById(id: string): Promise<CustomAgentData | null>;
  create(data: CreateCustomAgentRepoInput): Promise<CustomAgentData>;
  update(id: string, data: UpdateCustomAgentRepoInput): Promise<CustomAgentData>;
  delete(id: string): Promise<void>;
}
