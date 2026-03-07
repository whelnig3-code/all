// Data State Reducer
// Manages domain data: projects, conversations, and their selection state.

import type { Project } from "@/types";

export interface Conversation {
  readonly id: string;
  readonly projectId: string | null;
  readonly title: string;
  readonly messageCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DataState {
  readonly projects: Project[];
  readonly activeProjectId: string | null;
  readonly conversations: Conversation[];
  readonly activeConversationId: string | null;
  readonly isConversationsLoading: boolean;
}

export type DataAction =
  | { type: "SET_PROJECTS"; payload: Project[] }
  | { type: "ADD_PROJECT"; payload: Project }
  | { type: "DELETE_PROJECT"; payload: string }
  | { type: "RENAME_PROJECT"; payload: { id: string; name: string } }
  | { type: "SET_ACTIVE_PROJECT_ID"; payload: string | null }
  | { type: "SET_CONVERSATIONS"; payload: Conversation[] }
  | { type: "ADD_CONVERSATION"; payload: Conversation }
  | { type: "DELETE_CONVERSATION"; payload: string }
  | { type: "RENAME_CONVERSATION"; payload: { id: string; title: string } }
  | { type: "SET_ACTIVE_CONVERSATION_ID"; payload: string | null }
  | { type: "SET_CONVERSATIONS_LOADING"; payload: boolean };

export const initialDataState: DataState = {
  projects: [],
  activeProjectId: null,
  conversations: [],
  activeConversationId: null,
  isConversationsLoading: true,
};

export function dataReducer(state: DataState, action: DataAction): DataState {
  switch (action.type) {
    case "SET_PROJECTS":
      return { ...state, projects: action.payload };

    case "ADD_PROJECT":
      return { ...state, projects: [...state.projects, action.payload] };

    case "DELETE_PROJECT":
      return {
        ...state,
        projects: state.projects.filter((p) => p.id !== action.payload),
        activeProjectId:
          state.activeProjectId === action.payload
            ? null
            : state.activeProjectId,
        conversations: state.conversations.filter(
          (c) => c.projectId !== action.payload
        ),
      };

    case "RENAME_PROJECT":
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.payload.id
            ? { ...p, name: action.payload.name }
            : p
        ),
      };

    case "SET_ACTIVE_PROJECT_ID":
      return { ...state, activeProjectId: action.payload };

    case "SET_CONVERSATIONS":
      return { ...state, conversations: action.payload };

    case "ADD_CONVERSATION":
      return {
        ...state,
        conversations: [action.payload, ...state.conversations],
      };

    case "DELETE_CONVERSATION":
      return {
        ...state,
        conversations: state.conversations.filter(
          (c) => c.id !== action.payload
        ),
        activeConversationId:
          state.activeConversationId === action.payload
            ? null
            : state.activeConversationId,
      };

    case "RENAME_CONVERSATION":
      return {
        ...state,
        conversations: state.conversations.map((c) =>
          c.id === action.payload.id
            ? { ...c, title: action.payload.title }
            : c
        ),
      };

    case "SET_ACTIVE_CONVERSATION_ID":
      return { ...state, activeConversationId: action.payload };

    case "SET_CONVERSATIONS_LOADING":
      return { ...state, isConversationsLoading: action.payload };

    default:
      return state;
  }
}
