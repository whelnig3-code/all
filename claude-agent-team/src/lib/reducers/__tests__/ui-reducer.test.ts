import { describe, it, expect } from "vitest";
import { uiReducer, initialUIState, type UIAction } from "../ui-reducer";

describe("uiReducer", () => {
  describe("SET_ACTIVE_TAB", () => {
    it("changes activeTab to the given payload", () => {
      const state = uiReducer(initialUIState, {
        type: "SET_ACTIVE_TAB",
        payload: "agents",
      });
      expect(state.activeTab).toBe("agents");
      expect(state.sidebarCollapsed).toBe(initialUIState.sidebarCollapsed);
    });

    it("preserves other fields when changing tab", () => {
      const modified = { ...initialUIState, sidebarCollapsed: true };
      const state = uiReducer(modified, {
        type: "SET_ACTIVE_TAB",
        payload: "terminal",
      });
      expect(state.activeTab).toBe("terminal");
      expect(state.sidebarCollapsed).toBe(true);
    });
  });

  describe("TOGGLE_SIDEBAR", () => {
    it("toggles sidebarCollapsed from false to true", () => {
      const state = uiReducer(initialUIState, { type: "TOGGLE_SIDEBAR" });
      expect(state.sidebarCollapsed).toBe(true);
    });

    it("toggles sidebarCollapsed from true to false", () => {
      const collapsed = { ...initialUIState, sidebarCollapsed: true };
      const state = uiReducer(collapsed, { type: "TOGGLE_SIDEBAR" });
      expect(state.sidebarCollapsed).toBe(false);
    });
  });

  describe("SET_SIDEBAR_COLLAPSED", () => {
    it("sets sidebarCollapsed to the given value", () => {
      const state = uiReducer(initialUIState, {
        type: "SET_SIDEBAR_COLLAPSED",
        payload: true,
      });
      expect(state.sidebarCollapsed).toBe(true);
    });
  });

  describe("TOGGLE_COMMAND_PALETTE", () => {
    it("toggles showCommandPalette", () => {
      const state = uiReducer(initialUIState, {
        type: "TOGGLE_COMMAND_PALETTE",
      });
      expect(state.showCommandPalette).toBe(true);
    });
  });

  describe("SET_COMMAND_PALETTE", () => {
    it("sets showCommandPalette to the given value", () => {
      const state = uiReducer(
        { ...initialUIState, showCommandPalette: true },
        { type: "SET_COMMAND_PALETTE", payload: false }
      );
      expect(state.showCommandPalette).toBe(false);
    });
  });

  describe("SET_CREATE_PROJECT_MODAL", () => {
    it("sets showCreateProjectModal to the given value", () => {
      const state = uiReducer(initialUIState, {
        type: "SET_CREATE_PROJECT_MODAL",
        payload: true,
      });
      expect(state.showCreateProjectModal).toBe(true);
    });
  });

  describe("SET_DELETING_PROJECT_ID", () => {
    it("sets deletingProjectId to the given value", () => {
      const state = uiReducer(initialUIState, {
        type: "SET_DELETING_PROJECT_ID",
        payload: "proj-123",
      });
      expect(state.deletingProjectId).toBe("proj-123");
    });

    it("clears deletingProjectId with null", () => {
      const withDeleting = { ...initialUIState, deletingProjectId: "proj-123" };
      const state = uiReducer(withDeleting, {
        type: "SET_DELETING_PROJECT_ID",
        payload: null,
      });
      expect(state.deletingProjectId).toBeNull();
    });
  });

  describe("SET_WINDOW_WIDTH", () => {
    it("sets windowWidth to the given value", () => {
      const state = uiReducer(initialUIState, {
        type: "SET_WINDOW_WIDTH",
        payload: 1024,
      });
      expect(state.windowWidth).toBe(1024);
    });
  });

  describe("SET_EDITOR_FILE_PATH", () => {
    it("sets editorFilePath to the given path", () => {
      const state = uiReducer(initialUIState, {
        type: "SET_EDITOR_FILE_PATH",
        payload: "/src/index.ts",
      });
      expect(state.editorFilePath).toBe("/src/index.ts");
    });

    it("clears editorFilePath with null", () => {
      const withFile = { ...initialUIState, editorFilePath: "/src/index.ts" };
      const state = uiReducer(withFile, {
        type: "SET_EDITOR_FILE_PATH",
        payload: null,
      });
      expect(state.editorFilePath).toBeNull();
    });
  });

  describe("SET_SELECTED_AGENT_ID", () => {
    it("sets selectedAgentId to the given value", () => {
      const state = uiReducer(initialUIState, {
        type: "SET_SELECTED_AGENT_ID",
        payload: "planner",
      });
      expect(state.selectedAgentId).toBe("planner");
    });
  });

  describe("immutability", () => {
    it("returns a new object, never mutates the original", () => {
      const state = uiReducer(initialUIState, {
        type: "SET_ACTIVE_TAB",
        payload: "settings",
      });
      expect(state).not.toBe(initialUIState);
      expect(initialUIState.activeTab).toBe("chat");
    });
  });

  describe("unknown action", () => {
    it("returns the same state reference for unknown actions", () => {
      const state = uiReducer(initialUIState, {
        type: "UNKNOWN_ACTION" as UIAction["type"],
      } as UIAction);
      expect(state).toBe(initialUIState);
    });
  });
});
