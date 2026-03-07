import { describe, it, expect } from "vitest";
import {
  dataReducer,
  initialDataState,
  type DataAction,
  type Conversation,
} from "../data-reducer";

// Test helper: create a project
const makeProject = (id: string) => ({
  id,
  name: `Project ${id}`,
  icon: "P",
  description: `Desc ${id}`,
  path: `/projects/${id}`,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});

// Test helper: create a conversation
const makeConversation = (id: string, projectId: string | null = null): Conversation => ({
  id,
  projectId,
  title: `Conv ${id}`,
  messageCount: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});

describe("dataReducer", () => {
  describe("SET_PROJECTS", () => {
    it("replaces the projects array", () => {
      const projects = [makeProject("p1"), makeProject("p2")];
      const state = dataReducer(initialDataState, {
        type: "SET_PROJECTS",
        payload: projects,
      });
      expect(state.projects).toEqual(projects);
      expect(state.projects).not.toBe(initialDataState.projects);
    });
  });

  describe("ADD_PROJECT", () => {
    it("adds a project to the list", () => {
      const project = makeProject("p1");
      const state = dataReducer(initialDataState, {
        type: "ADD_PROJECT",
        payload: project,
      });
      expect(state.projects).toHaveLength(1);
      expect(state.projects[0]).toEqual(project);
    });
  });

  describe("DELETE_PROJECT", () => {
    it("removes project by id and clears activeProjectId if matching", () => {
      const initial = {
        ...initialDataState,
        projects: [makeProject("p1"), makeProject("p2")],
        activeProjectId: "p1" as string | null,
        conversations: [
          makeConversation("c1", "p1"),
          makeConversation("c2", "p2"),
        ],
      };
      const state = dataReducer(initial, {
        type: "DELETE_PROJECT",
        payload: "p1",
      });
      expect(state.projects).toHaveLength(1);
      expect(state.projects[0].id).toBe("p2");
      expect(state.activeProjectId).toBeNull();
      // Also removes conversations belonging to deleted project
      expect(state.conversations).toHaveLength(1);
      expect(state.conversations[0].id).toBe("c2");
    });

    it("preserves activeProjectId if deleting a different project", () => {
      const initial = {
        ...initialDataState,
        projects: [makeProject("p1"), makeProject("p2")],
        activeProjectId: "p2" as string | null,
        conversations: [],
      };
      const state = dataReducer(initial, {
        type: "DELETE_PROJECT",
        payload: "p1",
      });
      expect(state.activeProjectId).toBe("p2");
    });
  });

  describe("RENAME_PROJECT", () => {
    it("renames a project by id", () => {
      const initial = {
        ...initialDataState,
        projects: [makeProject("p1")],
      };
      const state = dataReducer(initial, {
        type: "RENAME_PROJECT",
        payload: { id: "p1", name: "New Name" },
      });
      expect(state.projects[0].name).toBe("New Name");
    });

    it("does not mutate projects that do not match", () => {
      const initial = {
        ...initialDataState,
        projects: [makeProject("p1"), makeProject("p2")],
      };
      const state = dataReducer(initial, {
        type: "RENAME_PROJECT",
        payload: { id: "p1", name: "Renamed" },
      });
      expect(state.projects[1].name).toBe("Project p2");
    });
  });

  describe("SET_ACTIVE_PROJECT_ID", () => {
    it("sets the activeProjectId", () => {
      const state = dataReducer(initialDataState, {
        type: "SET_ACTIVE_PROJECT_ID",
        payload: "p1",
      });
      expect(state.activeProjectId).toBe("p1");
    });
  });

  describe("SET_CONVERSATIONS", () => {
    it("replaces the conversations array", () => {
      const convs = [makeConversation("c1"), makeConversation("c2")];
      const state = dataReducer(initialDataState, {
        type: "SET_CONVERSATIONS",
        payload: convs,
      });
      expect(state.conversations).toEqual(convs);
    });
  });

  describe("ADD_CONVERSATION", () => {
    it("prepends a conversation to the list", () => {
      const existing = {
        ...initialDataState,
        conversations: [makeConversation("c1")],
      };
      const newConv = makeConversation("c2");
      const state = dataReducer(existing, {
        type: "ADD_CONVERSATION",
        payload: newConv,
      });
      expect(state.conversations).toHaveLength(2);
      expect(state.conversations[0].id).toBe("c2");
    });
  });

  describe("DELETE_CONVERSATION", () => {
    it("removes conversation by id and clears activeConversationId if matching", () => {
      const initial = {
        ...initialDataState,
        conversations: [makeConversation("c1"), makeConversation("c2")],
        activeConversationId: "c1" as string | null,
      };
      const state = dataReducer(initial, {
        type: "DELETE_CONVERSATION",
        payload: "c1",
      });
      expect(state.conversations).toHaveLength(1);
      expect(state.activeConversationId).toBeNull();
    });

    it("preserves activeConversationId if deleting a different conversation", () => {
      const initial = {
        ...initialDataState,
        conversations: [makeConversation("c1"), makeConversation("c2")],
        activeConversationId: "c2" as string | null,
      };
      const state = dataReducer(initial, {
        type: "DELETE_CONVERSATION",
        payload: "c1",
      });
      expect(state.activeConversationId).toBe("c2");
    });
  });

  describe("RENAME_CONVERSATION", () => {
    it("renames a conversation by id", () => {
      const initial = {
        ...initialDataState,
        conversations: [makeConversation("c1")],
      };
      const state = dataReducer(initial, {
        type: "RENAME_CONVERSATION",
        payload: { id: "c1", title: "Updated Title" },
      });
      expect(state.conversations[0].title).toBe("Updated Title");
    });
  });

  describe("SET_ACTIVE_CONVERSATION_ID", () => {
    it("sets the activeConversationId", () => {
      const state = dataReducer(initialDataState, {
        type: "SET_ACTIVE_CONVERSATION_ID",
        payload: "c1",
      });
      expect(state.activeConversationId).toBe("c1");
    });
  });

  describe("SET_CONVERSATIONS_LOADING", () => {
    it("sets isConversationsLoading", () => {
      const state = dataReducer(initialDataState, {
        type: "SET_CONVERSATIONS_LOADING",
        payload: false,
      });
      expect(state.isConversationsLoading).toBe(false);
    });
  });

  describe("immutability", () => {
    it("returns a new object, never mutates the original", () => {
      const state = dataReducer(initialDataState, {
        type: "SET_ACTIVE_PROJECT_ID",
        payload: "p1",
      });
      expect(state).not.toBe(initialDataState);
      expect(initialDataState.activeProjectId).toBeNull();
    });
  });

  describe("unknown action", () => {
    it("returns the same state reference for unknown actions", () => {
      const state = dataReducer(initialDataState, {
        type: "UNKNOWN_ACTION" as DataAction["type"],
      } as DataAction);
      expect(state).toBe(initialDataState);
    });
  });
});
