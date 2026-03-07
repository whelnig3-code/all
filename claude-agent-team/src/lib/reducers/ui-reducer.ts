// UI State Reducer
// Manages visual/layout state: tabs, sidebar, modals, window size, etc.

export interface UIState {
  readonly activeTab: string;
  readonly sidebarCollapsed: boolean;
  readonly showCommandPalette: boolean;
  readonly showCreateProjectModal: boolean;
  readonly deletingProjectId: string | null;
  readonly windowWidth: number;
  readonly editorFilePath: string | null;
  readonly selectedAgentId: string | null;
}

export type UIAction =
  | { type: "SET_ACTIVE_TAB"; payload: string }
  | { type: "TOGGLE_SIDEBAR" }
  | { type: "SET_SIDEBAR_COLLAPSED"; payload: boolean }
  | { type: "TOGGLE_COMMAND_PALETTE" }
  | { type: "SET_COMMAND_PALETTE"; payload: boolean }
  | { type: "SET_CREATE_PROJECT_MODAL"; payload: boolean }
  | { type: "SET_DELETING_PROJECT_ID"; payload: string | null }
  | { type: "SET_WINDOW_WIDTH"; payload: number }
  | { type: "SET_EDITOR_FILE_PATH"; payload: string | null }
  | { type: "SET_SELECTED_AGENT_ID"; payload: string | null };

export const initialUIState: UIState = {
  activeTab: "chat",
  sidebarCollapsed: false,
  showCommandPalette: false,
  showCreateProjectModal: false,
  deletingProjectId: null,
  windowWidth: 1920,
  editorFilePath: null,
  selectedAgentId: null,
};

export function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case "SET_ACTIVE_TAB":
      return { ...state, activeTab: action.payload };
    case "TOGGLE_SIDEBAR":
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed };
    case "SET_SIDEBAR_COLLAPSED":
      return { ...state, sidebarCollapsed: action.payload };
    case "TOGGLE_COMMAND_PALETTE":
      return { ...state, showCommandPalette: !state.showCommandPalette };
    case "SET_COMMAND_PALETTE":
      return { ...state, showCommandPalette: action.payload };
    case "SET_CREATE_PROJECT_MODAL":
      return { ...state, showCreateProjectModal: action.payload };
    case "SET_DELETING_PROJECT_ID":
      return { ...state, deletingProjectId: action.payload };
    case "SET_WINDOW_WIDTH":
      return { ...state, windowWidth: action.payload };
    case "SET_EDITOR_FILE_PATH":
      return { ...state, editorFilePath: action.payload };
    case "SET_SELECTED_AGENT_ID":
      return { ...state, selectedAgentId: action.payload };
    default:
      return state;
  }
}
