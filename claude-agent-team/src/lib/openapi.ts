/**
 * Manual OpenAPI 3.0.3 specification generated from zod schemas.
 *
 * Zod v4 does not have an official `@zod/to-openapi` package, so the spec
 * is constructed as a plain object that mirrors every API route and its
 * validated request/response shapes.
 */

import type { OpenAPIV3 } from "./openapi-types";

// ─── Reusable component schemas ──────────────────────────────────────────────

const agentIdEnum = [
  "planner",
  "developer",
  "reviewer",
  "writer",
  "security-auditor",
  "researcher",
  "designer",
] as const;

const priorityEnum = ["low", "medium", "high"] as const;

const errorResponse: OpenAPIV3.SchemaObject = {
  type: "object",
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { type: "string", example: "VALIDATION_ERROR" },
        message: { type: "string", example: "Invalid input" },
        details: { type: "object", additionalProperties: true },
      },
    },
  },
};

const okResponse: OpenAPIV3.SchemaObject = {
  type: "object",
  properties: {
    ok: { type: "boolean", example: true },
  },
};

// ─── Component schemas ───────────────────────────────────────────────────────

function buildComponentSchemas(): Record<string, OpenAPIV3.SchemaObject> {
  return {
    Error: errorResponse,
    Ok: okResponse,

    // Agents
    ToggleAgentRequest: {
      type: "object",
      required: ["agentId", "active"],
      properties: {
        agentId: { type: "string", enum: [...agentIdEnum] },
        active: { type: "boolean" },
      },
    },
    AgentStatus: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        active: { type: "boolean" },
        description: { type: "string" },
      },
    },

    // Auth
    LoginRequest: {
      type: "object",
      required: ["token"],
      properties: {
        token: { type: "string", minLength: 1 },
      },
    },

    // Chat
    FileAttachment: {
      type: "object",
      required: ["name", "kind", "content"],
      properties: {
        name: { type: "string", minLength: 1 },
        kind: { type: "string", enum: ["image", "file"] },
        content: { type: "string", minLength: 1 },
        mimeType: { type: "string" },
      },
    },
    ChatRequest: {
      type: "object",
      properties: {
        message: { type: "string", default: "" },
        targetAgent: { type: "string", enum: [...agentIdEnum] },
        conversationId: { type: "string" },
        projectDefaultAgent: { type: "string", enum: [...agentIdEnum] },
        attachments: {
          type: "array",
          items: { $ref: "#/components/schemas/FileAttachment" },
        },
      },
    },

    // Conversations
    ConversationMeta: {
      type: "object",
      properties: {
        id: { type: "string" },
        projectId: { type: "string", nullable: true },
        title: { type: "string" },
        messageCount: { type: "integer" },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
    },
    CreateConversationRequest: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        title: { type: "string" },
      },
    },
    UpdateConversationRequest: {
      type: "object",
      properties: {
        title: { type: "string" },
      },
    },

    // Files
    UpdateFileRequest: {
      type: "object",
      required: ["path", "content"],
      properties: {
        path: { type: "string", minLength: 1 },
        content: { type: "string" },
      },
    },
    ReadDirRequest: {
      type: "object",
      properties: {
        dir: { type: "string", default: "" },
        depth: { type: "integer", minimum: 1, maximum: 10, default: 2 },
      },
    },

    // Messages
    AddMessageRequest: {
      type: "object",
      required: ["conversationId", "role", "content"],
      properties: {
        conversationId: { type: "string", minLength: 1 },
        role: { type: "string", enum: ["user", "assistant"] },
        content: { type: "string", minLength: 1 },
      },
    },
    Message: {
      type: "object",
      properties: {
        id: { type: "string" },
        conversationId: { type: "string" },
        role: { type: "string", enum: ["user", "assistant"] },
        content: { type: "string" },
        createdAt: { type: "string", format: "date-time" },
      },
    },

    // Projects
    CreateProjectRequest: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", minLength: 1 },
        icon: { type: "string" },
        description: { type: "string" },
        path: { type: "string" },
      },
    },
    UpdateProjectRequest: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1 },
        icon: { type: "string" },
        description: { type: "string" },
        path: { type: "string" },
      },
    },
    ProjectMeta: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        icon: { type: "string" },
        description: { type: "string" },
        path: { type: "string" },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
    },

    // Settings
    UpdateSettingsRequest: {
      type: "object",
      properties: {
        projectBasePath: { type: "string" },
        defaultModel: { type: "string" },
        agentModels: {
          type: "object",
          additionalProperties: { type: "string" },
        },
      },
    },
    AppSettings: {
      type: "object",
      properties: {
        projectBasePath: { type: "string" },
        defaultModel: { type: "string" },
        agentModels: {
          type: "object",
          additionalProperties: { type: "string" },
        },
        updatedAt: { type: "string", format: "date-time" },
      },
    },

    // Todos
    CreateTodoRequest: {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string", minLength: 1 },
        priority: {
          type: "string",
          enum: [...priorityEnum],
          default: "medium",
        },
      },
    },
    UpdateTodoRequest: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", minLength: 1 },
        done: { type: "boolean" },
        text: { type: "string" },
        priority: { type: "string", enum: [...priorityEnum] },
      },
    },
    Todo: {
      type: "object",
      properties: {
        id: { type: "string" },
        text: { type: "string" },
        done: { type: "boolean" },
        priority: { type: "string", enum: [...priorityEnum] },
        createdAt: { type: "integer", description: "Unix timestamp (ms)" },
      },
    },

    // Workflows
    CreateWorkflowRequest: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", minLength: 1 },
        description: { type: "string", default: "" },
        steps: {
          type: "array",
          items: { type: "string" },
          default: [],
        },
      },
    },
    UpdateWorkflowRequest: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1 },
        description: { type: "string" },
        steps: { type: "array", items: { type: "string" } },
      },
    },
    WorkflowMeta: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        steps: { type: "array", items: { type: "string" } },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
    },
  };
}

// ─── Helper: standard response refs ─────────────────────────────────────────

function errorRef(
  status: number,
  description: string
): OpenAPIV3.ResponseObject {
  return {
    description,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/Error" },
      },
    },
  };
}

function jsonResponse(
  description: string,
  schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject
): OpenAPIV3.ResponseObject {
  return {
    description,
    content: { "application/json": { schema } },
  };
}

function jsonBody(
  ref: string,
  required = true
): OpenAPIV3.RequestBodyObject {
  return {
    required,
    content: {
      "application/json": {
        schema: { $ref: `#/components/schemas/${ref}` },
      },
    },
  };
}

// ─── Paths ───────────────────────────────────────────────────────────────────

function buildPaths(): Record<string, OpenAPIV3.PathItemObject> {
  return {
    // ── Agents ─────────────────────────────────────────────────────────────
    "/api/agents": {
      get: {
        tags: ["Agents"],
        summary: "List agents and API stats",
        operationId: "getAgents",
        responses: {
          "200": jsonResponse("Agent list with stats", {
            type: "object",
            properties: {
              agents: {
                type: "array",
                items: { $ref: "#/components/schemas/AgentStatus" },
              },
              stats: { type: "object", additionalProperties: true },
            },
          }),
        },
      },
      patch: {
        tags: ["Agents"],
        summary: "Toggle agent active status",
        operationId: "toggleAgent",
        requestBody: jsonBody("ToggleAgentRequest"),
        responses: {
          "200": jsonResponse("Success", { $ref: "#/components/schemas/Ok" }),
          "400": errorRef(400, "Validation error"),
        },
      },
    },

    // ── Auth ───────────────────────────────────────────────────────────────
    "/api/auth": {
      post: {
        tags: ["Auth"],
        summary: "Login with dashboard secret token",
        operationId: "login",
        description:
          "Validates the provided token against DASHBOARD_SECRET and sets an HttpOnly cookie.",
        requestBody: jsonBody("LoginRequest"),
        responses: {
          "200": jsonResponse("Login successful (sets jm_auth cookie)", {
            $ref: "#/components/schemas/Ok",
          }),
          "400": errorRef(400, "Invalid request body"),
          "401": jsonResponse("Invalid token", {
            type: "object",
            properties: { error: { type: "string" } },
          }),
        },
      },
      delete: {
        tags: ["Auth"],
        summary: "Logout (clear auth cookie)",
        operationId: "logout",
        responses: {
          "200": jsonResponse("Logged out", {
            $ref: "#/components/schemas/Ok",
          }),
        },
      },
    },

    // ── Chat ───────────────────────────────────────────────────────────────
    "/api/chat": {
      post: {
        tags: ["Chat"],
        summary: "Send a message (SSE streaming response)",
        operationId: "chat",
        description:
          "Sends a user message to the agent system. Returns a Server-Sent Events stream with agent responses.",
        requestBody: jsonBody("ChatRequest"),
        responses: {
          "200": {
            description: "SSE stream of agent events",
            content: {
              "text/event-stream": {
                schema: { type: "string" },
              },
            },
          },
          "400": errorRef(400, "Validation error or empty message"),
        },
      },
    },

    // ── Conversations ──────────────────────────────────────────────────────
    "/api/conversations": {
      get: {
        tags: ["Conversations"],
        summary: "List conversations",
        operationId: "listConversations",
        parameters: [
          {
            name: "q",
            in: "query",
            schema: { type: "string" },
            description: "Full-text search query",
          },
          {
            name: "projectId",
            in: "query",
            schema: { type: "string" },
            description: "Filter by project ID",
          },
        ],
        responses: {
          "200": jsonResponse("Conversation list", {
            type: "object",
            properties: {
              conversations: {
                type: "array",
                items: { $ref: "#/components/schemas/ConversationMeta" },
              },
            },
          }),
        },
      },
      post: {
        tags: ["Conversations"],
        summary: "Create a conversation",
        operationId: "createConversation",
        requestBody: jsonBody("CreateConversationRequest"),
        responses: {
          "200": jsonResponse("Created conversation", {
            type: "object",
            properties: {
              conversation: {
                $ref: "#/components/schemas/ConversationMeta",
              },
            },
          }),
          "400": errorRef(400, "Validation error"),
        },
      },
    },

    "/api/conversations/{id}": {
      get: {
        tags: ["Conversations"],
        summary: "Get conversation metadata",
        operationId: "getConversation",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": jsonResponse("Conversation metadata", {
            $ref: "#/components/schemas/ConversationMeta",
          }),
          "404": errorRef(404, "Conversation not found"),
        },
      },
      patch: {
        tags: ["Conversations"],
        summary: "Update conversation (e.g. rename)",
        operationId: "updateConversation",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: jsonBody("UpdateConversationRequest"),
        responses: {
          "200": jsonResponse("Updated conversation", {
            type: "object",
            properties: {
              conversation: {
                $ref: "#/components/schemas/ConversationMeta",
              },
            },
          }),
          "400": errorRef(400, "Validation error"),
        },
      },
      delete: {
        tags: ["Conversations"],
        summary: "Delete a conversation",
        operationId: "deleteConversation",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": jsonResponse("Deleted", { $ref: "#/components/schemas/Ok" }),
        },
      },
    },

    "/api/conversations/{id}/export": {
      get: {
        tags: ["Conversations"],
        summary: "Export conversation as Markdown",
        operationId: "exportConversation",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Markdown file download",
            content: {
              "text/markdown": {
                schema: { type: "string" },
              },
            },
          },
          "404": errorRef(404, "Conversation not found"),
        },
      },
    },

    // ── Files ──────────────────────────────────────────────────────────────
    "/api/files": {
      get: {
        tags: ["Files"],
        summary: "Read a file by path",
        operationId: "readFile",
        parameters: [
          {
            name: "path",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "File path (relative to project base)",
          },
        ],
        responses: {
          "200": jsonResponse("File content", {
            type: "object",
            properties: {
              content: { type: "string" },
              path: { type: "string" },
              size: { type: "integer" },
              mtime: { type: "string", format: "date-time" },
            },
          }),
          "400": errorRef(400, "Path required"),
          "403": errorRef(403, "Access denied"),
        },
      },
      put: {
        tags: ["Files"],
        summary: "Write/update a file",
        operationId: "updateFile",
        requestBody: jsonBody("UpdateFileRequest"),
        responses: {
          "200": jsonResponse("File written", {
            type: "object",
            properties: {
              ok: { type: "boolean" },
              path: { type: "string" },
            },
          }),
          "400": errorRef(400, "Validation error"),
          "403": errorRef(403, "Access denied"),
        },
      },
      post: {
        tags: ["Files"],
        summary: "Read directory tree",
        operationId: "readDir",
        requestBody: jsonBody("ReadDirRequest", false),
        responses: {
          "200": jsonResponse("Directory tree", {
            type: "object",
            properties: {
              tree: { type: "array", items: { type: "object" } },
              base: { type: "string" },
            },
          }),
          "400": errorRef(400, "Validation error"),
        },
      },
    },

    // ── Messages ───────────────────────────────────────────────────────────
    "/api/messages": {
      get: {
        tags: ["Messages"],
        summary: "Get messages for a conversation",
        operationId: "getMessages",
        parameters: [
          {
            name: "conversationId",
            in: "query",
            schema: { type: "string" },
            description: "Conversation ID",
          },
        ],
        responses: {
          "200": jsonResponse("Message list", {
            type: "object",
            properties: {
              messages: {
                type: "array",
                items: { $ref: "#/components/schemas/Message" },
              },
            },
          }),
        },
      },
      post: {
        tags: ["Messages"],
        summary: "Add a message to a conversation",
        operationId: "addMessage",
        requestBody: jsonBody("AddMessageRequest"),
        responses: {
          "200": jsonResponse("Success", { $ref: "#/components/schemas/Ok" }),
          "400": errorRef(400, "Validation error"),
        },
      },
    },

    // ── Projects ───────────────────────────────────────────────────────────
    "/api/projects": {
      get: {
        tags: ["Projects"],
        summary: "List all projects",
        operationId: "listProjects",
        responses: {
          "200": jsonResponse("Project list", {
            type: "object",
            properties: {
              projects: {
                type: "array",
                items: { $ref: "#/components/schemas/ProjectMeta" },
              },
            },
          }),
        },
      },
      post: {
        tags: ["Projects"],
        summary: "Create a project",
        operationId: "createProject",
        requestBody: jsonBody("CreateProjectRequest"),
        responses: {
          "200": jsonResponse("Created project", {
            type: "object",
            properties: {
              project: { $ref: "#/components/schemas/ProjectMeta" },
            },
          }),
          "400": errorRef(400, "Validation error"),
        },
      },
    },

    "/api/projects/{id}": {
      patch: {
        tags: ["Projects"],
        summary: "Update a project",
        operationId: "updateProject",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: jsonBody("UpdateProjectRequest"),
        responses: {
          "200": jsonResponse("Updated project", {
            type: "object",
            properties: {
              project: { $ref: "#/components/schemas/ProjectMeta" },
            },
          }),
          "400": errorRef(400, "Validation error"),
        },
      },
      delete: {
        tags: ["Projects"],
        summary: "Delete a project",
        operationId: "deleteProject",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": jsonResponse("Deleted", { $ref: "#/components/schemas/Ok" }),
        },
      },
    },

    // ── Settings ───────────────────────────────────────────────────────────
    "/api/settings": {
      get: {
        tags: ["Settings"],
        summary: "Get application settings",
        operationId: "getSettings",
        responses: {
          "200": jsonResponse("Current settings", {
            type: "object",
            properties: {
              settings: { $ref: "#/components/schemas/AppSettings" },
              apiKeyStatus: {
                type: "object",
                properties: {
                  configured: { type: "boolean" },
                  masked: { type: "string", nullable: true },
                },
              },
              claudeMode: { type: "string" },
            },
          }),
        },
      },
      patch: {
        tags: ["Settings"],
        summary: "Update application settings",
        operationId: "updateSettings",
        requestBody: jsonBody("UpdateSettingsRequest"),
        responses: {
          "200": jsonResponse("Updated settings", {
            type: "object",
            properties: {
              settings: { $ref: "#/components/schemas/AppSettings" },
            },
          }),
          "400": errorRef(400, "Validation error"),
        },
      },
    },

    // ── Todos ──────────────────────────────────────────────────────────────
    "/api/todos": {
      get: {
        tags: ["Todos"],
        summary: "List all todos",
        operationId: "listTodos",
        responses: {
          "200": jsonResponse("Todo list", {
            type: "object",
            properties: {
              todos: {
                type: "array",
                items: { $ref: "#/components/schemas/Todo" },
              },
            },
          }),
        },
      },
      post: {
        tags: ["Todos"],
        summary: "Create a todo",
        operationId: "createTodo",
        requestBody: jsonBody("CreateTodoRequest"),
        responses: {
          "201": jsonResponse("Created todo", {
            type: "object",
            properties: {
              todo: { $ref: "#/components/schemas/Todo" },
            },
          }),
          "400": errorRef(400, "Validation error"),
        },
      },
      patch: {
        tags: ["Todos"],
        summary: "Update a todo",
        operationId: "updateTodo",
        requestBody: jsonBody("UpdateTodoRequest"),
        responses: {
          "200": jsonResponse("Updated todo", {
            type: "object",
            properties: {
              todo: { $ref: "#/components/schemas/Todo" },
            },
          }),
          "400": errorRef(400, "Validation error"),
          "404": errorRef(404, "Todo not found"),
        },
      },
      delete: {
        tags: ["Todos"],
        summary: "Delete a todo",
        operationId: "deleteTodo",
        parameters: [
          {
            name: "id",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "Todo ID",
          },
        ],
        responses: {
          "200": jsonResponse("Deleted", { $ref: "#/components/schemas/Ok" }),
          "400": errorRef(400, "id required"),
        },
      },
    },

    // ── Workflows ──────────────────────────────────────────────────────────
    "/api/workflows": {
      get: {
        tags: ["Workflows"],
        summary: "List all workflows",
        operationId: "listWorkflows",
        responses: {
          "200": jsonResponse("Workflow list", {
            type: "object",
            properties: {
              workflows: {
                type: "array",
                items: { $ref: "#/components/schemas/WorkflowMeta" },
              },
            },
          }),
        },
      },
      post: {
        tags: ["Workflows"],
        summary: "Create a workflow",
        operationId: "createWorkflow",
        requestBody: jsonBody("CreateWorkflowRequest"),
        responses: {
          "201": jsonResponse("Created workflow", {
            type: "object",
            properties: {
              workflow: { $ref: "#/components/schemas/WorkflowMeta" },
            },
          }),
          "400": errorRef(400, "Validation error"),
        },
      },
    },

    "/api/workflows/{id}": {
      patch: {
        tags: ["Workflows"],
        summary: "Update a workflow",
        operationId: "updateWorkflow",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: jsonBody("UpdateWorkflowRequest"),
        responses: {
          "200": jsonResponse("Updated workflow", {
            type: "object",
            properties: {
              workflow: { $ref: "#/components/schemas/WorkflowMeta" },
            },
          }),
          "400": errorRef(400, "Validation error"),
          "404": errorRef(404, "Workflow not found"),
        },
      },
      delete: {
        tags: ["Workflows"],
        summary: "Delete a workflow",
        operationId: "deleteWorkflow",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": jsonResponse("Deleted", {
            type: "object",
            properties: {
              success: { type: "boolean", example: true },
            },
          }),
          "404": errorRef(404, "Workflow not found"),
        },
      },
    },
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function generateOpenAPISpec(): OpenAPIV3.Document {
  return {
    openapi: "3.0.3",
    info: {
      title: "JM Agent Team API",
      version: "1.0.0",
      description:
        "AI Agent Team Dashboard API — manage agents, conversations, " +
        "projects, files, todos, workflows, and settings.",
    },
    servers: [
      {
        url: "/",
        description: "Current server",
      },
    ],
    tags: [
      { name: "Agents", description: "Agent management" },
      { name: "Auth", description: "Authentication (cookie-based)" },
      { name: "Chat", description: "Chat with AI agents (SSE)" },
      { name: "Conversations", description: "Conversation CRUD and export" },
      { name: "Files", description: "File read/write and directory browsing" },
      { name: "Messages", description: "Conversation messages" },
      { name: "Projects", description: "Project management" },
      { name: "Settings", description: "Application settings" },
      { name: "Todos", description: "Todo list management" },
      { name: "Workflows", description: "Workflow management" },
    ],
    paths: buildPaths(),
    components: {
      schemas: buildComponentSchemas(),
    },
  };
}
