// Integration test: verifies composite state transitions
// that page.tsx handlers perform across multiple reducers.
// Analogous to testing a conductor's score — each instrument (reducer)
// is tested individually, but the concert (page) needs coordination tests.

import { describe, it, expect } from "vitest";
import { uiReducer, initialUIState, type UIAction } from "../ui-reducer";
import { dataReducer, initialDataState, type DataAction, type Conversation } from "../data-reducer";
import { agentReducer, initialAgentState, type AgentAction } from "../agent-reducer";

// Helper: simulate multi-dispatch handler (like page.tsx handlers do)
function applyActions<S, A>(reducer: (s: S, a: A) => S, state: S, actions: A[]): S {
  return actions.reduce((s, a) => reducer(s, a), state);
}

const makeProject = (id: string) => ({
  id,
  name: `Project ${id}`,
  icon: "P",
  description: `Desc ${id}`,
  path: `/projects/${id}`,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});

const makeConversation = (id: string, projectId: string | null = null): Conversation => ({
  id,
  projectId,
  title: `Conv ${id}`,
  messageCount: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});

describe("Page state integration — composite handlers", () => {
  describe("handleDeleteProject", () => {
    it("removes project + related conversations (dataReducer) and clears modal (uiReducer)", () => {
      // Setup: project p1 active, conversations for p1 and p2, deleting modal open for p1
      const dataState = {
        ...initialDataState,
        projects: [makeProject("p1"), makeProject("p2")],
        activeProjectId: "p1" as string | null,
        conversations: [makeConversation("c1", "p1"), makeConversation("c2", "p2")],
      };
      const uiState = {
        ...initialUIState,
        deletingProjectId: "p1" as string | null,
      };

      // Simulate handleDeleteProject("p1"):
      // 1. dataDispatch DELETE_PROJECT
      // 2. uiDispatch SET_DELETING_PROJECT_ID null
      const newDataState = dataReducer(dataState, { type: "DELETE_PROJECT", payload: "p1" });
      const newUiState = uiReducer(uiState, { type: "SET_DELETING_PROJECT_ID", payload: null });

      expect(newDataState.projects).toHaveLength(1);
      expect(newDataState.projects[0].id).toBe("p2");
      expect(newDataState.activeProjectId).toBeNull();
      expect(newDataState.conversations).toHaveLength(1);
      expect(newDataState.conversations[0].id).toBe("c2");
      expect(newUiState.deletingProjectId).toBeNull();
    });
  });

  describe("CommandPalette agent select", () => {
    it("sets pending target agent, closes palette, and switches to chat tab", () => {
      const agentState = { ...initialAgentState };
      const uiState = { ...initialUIState, showCommandPalette: true, activeTab: "agents" };

      // Simulate onSelectAgent("planner"):
      // 1. agentDispatch SET_PENDING_TARGET_AGENT
      // 2. uiDispatch SET_COMMAND_PALETTE false
      // 3. uiDispatch SET_ACTIVE_TAB "chat"
      const newAgentState = agentReducer(agentState, {
        type: "SET_PENDING_TARGET_AGENT",
        payload: "planner",
      });
      const newUiState = applyActions(uiReducer, uiState, [
        { type: "SET_COMMAND_PALETTE" as const, payload: false },
        { type: "SET_ACTIVE_TAB" as const, payload: "chat" },
      ]);

      expect(newAgentState.pendingTargetAgent).toBe("planner");
      expect(newUiState.showCommandPalette).toBe(false);
      expect(newUiState.activeTab).toBe("chat");
    });
  });

  describe("Sidebar project select", () => {
    it("sets active project and switches to projects tab", () => {
      const dataState = { ...initialDataState };
      const uiState = { ...initialUIState, activeTab: "chat" };

      // Simulate setActiveProjectId(id) + setActiveTab("projects")
      const newDataState = dataReducer(dataState, {
        type: "SET_ACTIVE_PROJECT_ID",
        payload: "p1",
      });
      const newUiState = uiReducer(uiState, {
        type: "SET_ACTIVE_TAB",
        payload: "projects",
      });

      expect(newDataState.activeProjectId).toBe("p1");
      expect(newUiState.activeTab).toBe("projects");
    });
  });

  describe("Sidebar conversation select", () => {
    it("sets active conversation and switches to chat tab", () => {
      const dataState = { ...initialDataState };
      const uiState = { ...initialUIState, activeTab: "agents" };

      const newDataState = dataReducer(dataState, {
        type: "SET_ACTIVE_CONVERSATION_ID",
        payload: "c1",
      });
      const newUiState = uiReducer(uiState, {
        type: "SET_ACTIVE_TAB",
        payload: "chat",
      });

      expect(newDataState.activeConversationId).toBe("c1");
      expect(newUiState.activeTab).toBe("chat");
    });
  });

  describe("handleNewConversation", () => {
    it("adds conversation to list and sets it as active", () => {
      const dataState = {
        ...initialDataState,
        conversations: [makeConversation("c1")],
      };

      const newConv = makeConversation("c2");
      const newDataState = applyActions(dataReducer, dataState, [
        { type: "ADD_CONVERSATION" as const, payload: newConv },
        { type: "SET_ACTIVE_CONVERSATION_ID" as const, payload: "c2" },
      ]);

      expect(newDataState.conversations).toHaveLength(2);
      expect(newDataState.conversations[0].id).toBe("c2"); // prepended
      expect(newDataState.activeConversationId).toBe("c2");
    });
  });

  describe("handleCreateProject", () => {
    it("adds project and closes modal", () => {
      const dataState = { ...initialDataState };
      const uiState = { ...initialUIState, showCreateProjectModal: true };

      const project = makeProject("p1");
      const newDataState = dataReducer(dataState, { type: "ADD_PROJECT", payload: project });
      const newUiState = uiReducer(uiState, { type: "SET_CREATE_PROJECT_MODAL", payload: false });

      expect(newDataState.projects).toHaveLength(1);
      expect(newUiState.showCreateProjectModal).toBe(false);
    });
  });

  describe("File explorer → Editor", () => {
    it("sets editor file path and switches to editor tab", () => {
      const uiState = { ...initialUIState, activeTab: "files" };

      const newUiState = applyActions(uiReducer, uiState, [
        { type: "SET_EDITOR_FILE_PATH" as const, payload: "/src/index.ts" },
        { type: "SET_ACTIVE_TAB" as const, payload: "editor" },
      ]);

      expect(newUiState.editorFilePath).toBe("/src/index.ts");
      expect(newUiState.activeTab).toBe("editor");
    });
  });

  describe("Workflow run", () => {
    it("sets pending workflow agents and switches to chat tab", () => {
      const agentState = { ...initialAgentState };
      const uiState = { ...initialUIState, activeTab: "workflow" };

      const newAgentState = agentReducer(agentState, {
        type: "SET_PENDING_WORKFLOW_AGENTS",
        payload: ["planner", "developer"],
      });
      const newUiState = uiReducer(uiState, { type: "SET_ACTIVE_TAB", payload: "chat" });

      expect(newAgentState.pendingWorkflowAgents).toEqual(["planner", "developer"]);
      expect(newUiState.activeTab).toBe("chat");
    });
  });

  describe("Keyboard shortcut Ctrl+K", () => {
    it("toggles command palette", () => {
      const s1 = uiReducer(initialUIState, { type: "TOGGLE_COMMAND_PALETTE" });
      expect(s1.showCommandPalette).toBe(true);

      const s2 = uiReducer(s1, { type: "TOGGLE_COMMAND_PALETTE" });
      expect(s2.showCommandPalette).toBe(false);
    });
  });

  describe("showRightPanel derived state", () => {
    it("is true when width >= 900 and tab is not files/editor", () => {
      const wide = { ...initialUIState, windowWidth: 1920, activeTab: "chat" };
      const showRightPanel = wide.windowWidth >= 900 && wide.activeTab !== "files" && wide.activeTab !== "editor";
      expect(showRightPanel).toBe(true);
    });

    it("is false when width < 900", () => {
      const narrow = { ...initialUIState, windowWidth: 800, activeTab: "chat" };
      const showRightPanel = narrow.windowWidth >= 900 && narrow.activeTab !== "files" && narrow.activeTab !== "editor";
      expect(showRightPanel).toBe(false);
    });

    it("is false when tab is files", () => {
      const filesTab = { ...initialUIState, windowWidth: 1920, activeTab: "files" };
      const showRightPanel = filesTab.windowWidth >= 900 && filesTab.activeTab !== "files" && filesTab.activeTab !== "editor";
      expect(showRightPanel).toBe(false);
    });
  });
});
