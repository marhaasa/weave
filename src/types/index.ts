import type { Key } from 'ink';

export interface Config {
  maxRetries: number;
  theme: string;
}

export interface CommandResult {
  success: boolean;
  output: string;
  error?: string;
  command: string;
  duration?: number;
}

export interface HistoryEntry {
  command: string;
  timestamp: string;
  success: boolean;
  output?: string;
}

export interface WorkspaceItem {
  name: string;
  isNotebook: boolean;
  isDataPipeline?: boolean;
  isSparkJobDefinition?: boolean;
}

export interface ItemInfo {
  name: string;
  workspace: string;
}

// Keep for backward compatibility  
export interface NotebookInfo extends ItemInfo {}

export interface JobInfo {
  jobId: string;
  workspace: string;
  notebook: string;
  startTime: number;
}

export interface StatusInfo {
  status: string;
  startTime: string | null;
  endTime: string | null;
  jobType: string | null;
}


export interface State {
  currentView: string;
  selectedOption: number;
  output: string;
  loading: boolean;
  error: string;
  workspaces: string[];
  selectedWorkspace: number;
  workspaceItems: (string | WorkspaceItem)[];
  selectedWorkspaceItem: number;
  inInteractiveMode: boolean;
  commandHistory: HistoryEntry[];
  loadingProgress: number;
  config: Config | null;
  activeJobs: JobInfo[];
  currentJob: JobInfo | null;
  selectedJobOption: number;
  selectedItemAction: number;
  currentItem: ItemInfo | null;
  completedJobs: Set<string>;
  selectedDestinationWorkspace: number;
  isMovingItem: boolean;
}

export interface ExecuteCommandOptions {
  timeout?: number;
  silent?: boolean;
  env?: Record<string, string>;
}

export interface MenuOption {
  label: string;
  command?: string;
  action?: string;
  view?: string;
}

export interface StatusConfig {
  color: string;
  icon: string;
}

export type InputHandler = (input: string, key: Key) => void;

export interface ParseLinesFilters {
  skipEmpty?: boolean;
  skipHeaders?: boolean;
  skipPatterns?: string[];
}


export interface Actions {
  updateState: (updates: Partial<State>) => void;
  resetState: () => void;
  setCurrentView: (view: ViewType) => void;
  setSelectedOption: (option: number) => void;
  setOutput: (output: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;
  setWorkspaces: (workspaces: string[]) => void;
  setSelectedWorkspace: (index: number) => void;
  setWorkspaceItems: (items: (string | WorkspaceItem)[]) => void;
  setSelectedWorkspaceItem: (index: number) => void;
  setInInteractiveMode: (mode: boolean) => void;
  setLoadingProgress: (progress: number | ((prev: number) => number)) => void;
  setConfig: (config: Config) => void;
  setCurrentJob: (job: JobInfo | null) => void;
  setSelectedJobOption: (option: number) => void;
  setSelectedItemAction: (action: number) => void;
  setCurrentItem: (item: ItemInfo | null) => void;
  addToHistory: (command: string, result: CommandResult) => Promise<void>;
  addActiveJob: (jobId: string, workspace: string, notebook: string) => void;
  markJobCompleted: (workspace: string, notebook: string) => void;
  setCommandHistory: (history: HistoryEntry[]) => void;
  setSelectedDestinationWorkspace: (index: number) => void;
}

export interface Handlers {
  handleMenuSelection: () => Promise<void>;
  handleWorkspaceSelection: (forceRefresh?: boolean) => Promise<void>;
  handleWorkspaceItemSelection: () => Promise<void>;
  handleItemActionSelection: () => Promise<void>;
  handleJobMenuSelection: () => Promise<void>;
  checkJobStatus: () => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
  handleDestinationWorkspaceSelection: () => Promise<void>;
}

export type ViewType = string;
