// Agent State Reducer
// Manages agent orchestration state: processing, routing, preview, session stats.

import type { RoutingLogEntry } from "@/components/layout/RightPanel";

export interface SessionStats {
  readonly userCount: number;
  readonly agentCount: number;
  readonly toolCount: number;
  readonly firstTask?: string;
}

export interface AgentState {
  readonly isAgentProcessing: boolean;
  readonly pendingTargetAgent: string | null;
  readonly pendingWorkflowAgents: string[] | null;
  readonly previewContent: string | null;
  readonly routingLog: RoutingLogEntry[];
  readonly sessionStats: SessionStats | undefined;
}

export type AgentAction =
  | { type: "SET_AGENT_PROCESSING"; payload: boolean }
  | { type: "SET_PENDING_TARGET_AGENT"; payload: string | null }
  | { type: "SET_PENDING_WORKFLOW_AGENTS"; payload: string[] | null }
  | { type: "SET_PREVIEW_CONTENT"; payload: string | null }
  | { type: "ADD_ROUTING_EVENT"; payload: RoutingLogEntry }
  | { type: "SET_SESSION_STATS"; payload: SessionStats | undefined };

export const initialAgentState: AgentState = {
  isAgentProcessing: false,
  pendingTargetAgent: null,
  pendingWorkflowAgents: null,
  previewContent: null,
  routingLog: [],
  sessionStats: undefined,
};

export function agentReducer(
  state: AgentState,
  action: AgentAction
): AgentState {
  switch (action.type) {
    case "SET_AGENT_PROCESSING":
      return { ...state, isAgentProcessing: action.payload };

    case "SET_PENDING_TARGET_AGENT":
      return { ...state, pendingTargetAgent: action.payload };

    case "SET_PENDING_WORKFLOW_AGENTS":
      return { ...state, pendingWorkflowAgents: action.payload };

    case "SET_PREVIEW_CONTENT":
      return { ...state, previewContent: action.payload };

    case "ADD_ROUTING_EVENT":
      return {
        ...state,
        routingLog: [...state.routingLog.slice(-49), action.payload],
      };

    case "SET_SESSION_STATS":
      return { ...state, sessionStats: action.payload };

    default:
      return state;
  }
}
