import { describe, it, expect } from "vitest";
import {
  agentReducer,
  initialAgentState,
  type AgentAction,
  type SessionStats,
} from "../agent-reducer";
import type { RoutingLogEntry } from "@/components/layout/RightPanel";

// Test helper: create a routing log entry
const makeRoutingEntry = (
  targetAgent: string,
  method: RoutingLogEntry["method"] = "keyword"
): RoutingLogEntry => ({
  method,
  targetAgent,
  reason: `Routed to ${targetAgent}`,
  timestamp: Date.now(),
});

describe("agentReducer", () => {
  describe("SET_AGENT_PROCESSING", () => {
    it("sets isAgentProcessing to the given value", () => {
      const state = agentReducer(initialAgentState, {
        type: "SET_AGENT_PROCESSING",
        payload: true,
      });
      expect(state.isAgentProcessing).toBe(true);
    });
  });

  describe("SET_PENDING_TARGET_AGENT", () => {
    it("sets pendingTargetAgent to the given agent id", () => {
      const state = agentReducer(initialAgentState, {
        type: "SET_PENDING_TARGET_AGENT",
        payload: "planner",
      });
      expect(state.pendingTargetAgent).toBe("planner");
    });

    it("clears pendingTargetAgent with null", () => {
      const initial = { ...initialAgentState, pendingTargetAgent: "planner" as string | null };
      const state = agentReducer(initial, {
        type: "SET_PENDING_TARGET_AGENT",
        payload: null,
      });
      expect(state.pendingTargetAgent).toBeNull();
    });
  });

  describe("SET_PENDING_WORKFLOW_AGENTS", () => {
    it("sets pendingWorkflowAgents to the given array", () => {
      const agents = ["planner", "developer"];
      const state = agentReducer(initialAgentState, {
        type: "SET_PENDING_WORKFLOW_AGENTS",
        payload: agents,
      });
      expect(state.pendingWorkflowAgents).toEqual(agents);
    });

    it("clears pendingWorkflowAgents with null", () => {
      const initial = {
        ...initialAgentState,
        pendingWorkflowAgents: ["planner"] as string[] | null,
      };
      const state = agentReducer(initial, {
        type: "SET_PENDING_WORKFLOW_AGENTS",
        payload: null,
      });
      expect(state.pendingWorkflowAgents).toBeNull();
    });
  });

  describe("SET_PREVIEW_CONTENT", () => {
    it("sets previewContent to the given string", () => {
      const state = agentReducer(initialAgentState, {
        type: "SET_PREVIEW_CONTENT",
        payload: "# Hello World",
      });
      expect(state.previewContent).toBe("# Hello World");
    });

    it("clears previewContent with null", () => {
      const initial = { ...initialAgentState, previewContent: "content" as string | null };
      const state = agentReducer(initial, {
        type: "SET_PREVIEW_CONTENT",
        payload: null,
      });
      expect(state.previewContent).toBeNull();
    });
  });

  describe("ADD_ROUTING_EVENT", () => {
    it("appends a routing event to the log", () => {
      const event = makeRoutingEntry("planner");
      const state = agentReducer(initialAgentState, {
        type: "ADD_ROUTING_EVENT",
        payload: event,
      });
      expect(state.routingLog).toHaveLength(1);
      expect(state.routingLog[0].targetAgent).toBe("planner");
    });

    it("keeps only the last 50 entries", () => {
      // Build a state with 50 entries
      const fullLog = Array.from({ length: 50 }, (_, i) =>
        makeRoutingEntry(`agent-${i}`)
      );
      const initial = { ...initialAgentState, routingLog: fullLog };

      const newEvent = makeRoutingEntry("agent-new");
      const state = agentReducer(initial, {
        type: "ADD_ROUTING_EVENT",
        payload: newEvent,
      });
      expect(state.routingLog).toHaveLength(50);
      // First entry should be agent-1 (agent-0 dropped)
      expect(state.routingLog[0].targetAgent).toBe("agent-1");
      // Last entry should be the new one
      expect(state.routingLog[49].targetAgent).toBe("agent-new");
    });
  });

  describe("SET_SESSION_STATS", () => {
    it("sets sessionStats to the given value", () => {
      const stats: SessionStats = {
        userCount: 5,
        agentCount: 3,
        toolCount: 2,
        firstTask: "Build the app",
      };
      const state = agentReducer(initialAgentState, {
        type: "SET_SESSION_STATS",
        payload: stats,
      });
      expect(state.sessionStats).toEqual(stats);
    });

    it("clears sessionStats with undefined", () => {
      const initial = {
        ...initialAgentState,
        sessionStats: { userCount: 1, agentCount: 1, toolCount: 0 } as SessionStats | undefined,
      };
      const state = agentReducer(initial, {
        type: "SET_SESSION_STATS",
        payload: undefined,
      });
      expect(state.sessionStats).toBeUndefined();
    });
  });

  describe("immutability", () => {
    it("returns a new object, never mutates the original", () => {
      const state = agentReducer(initialAgentState, {
        type: "SET_AGENT_PROCESSING",
        payload: true,
      });
      expect(state).not.toBe(initialAgentState);
      expect(initialAgentState.isAgentProcessing).toBe(false);
    });

    it("does not mutate the routingLog array when adding events", () => {
      const event = makeRoutingEntry("planner");
      const originalLog = initialAgentState.routingLog;
      agentReducer(initialAgentState, {
        type: "ADD_ROUTING_EVENT",
        payload: event,
      });
      expect(initialAgentState.routingLog).toBe(originalLog);
      expect(initialAgentState.routingLog).toHaveLength(0);
    });
  });

  describe("unknown action", () => {
    it("returns the same state reference for unknown actions", () => {
      const state = agentReducer(initialAgentState, {
        type: "UNKNOWN_ACTION" as AgentAction["type"],
      } as AgentAction);
      expect(state).toBe(initialAgentState);
    });
  });
});
