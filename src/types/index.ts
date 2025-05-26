import type { Key } from 'ink';

export interface Config {
  cacheTimeout: number;
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
}

export interface NotebookInfo {
  name: string;
  workspace: string;
}

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

export interface CachedData<T = any> {
  data: T;
  timestamp: number;
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
  selectedNotebookAction: number;
  currentNotebook: NotebookInfo | null;
  completedJobs: Set<string>;
  cache: Map<string, CachedData>;
}

export interface ExecuteCommandOptions {
  timeout?: number;
  skipCache?: boolean;
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
  setSelectedNotebookAction: (action: number) => void;
  setCurrentNotebook: (notebook: NotebookInfo | null) => void;
  addToHistory: (command: string, result: CommandResult) => Promise<void>;
  getCachedData: <T = any>(key: string) => T | null;
  setCachedData: <T = any>(key: string, data: T) => void;
  addActiveJob: (jobId: string, workspace: string, notebook: string) => void;
  markJobCompleted: (workspace: string, notebook: string) => void;
  setCommandHistory: (history: HistoryEntry[]) => void;
}

export interface Handlers {
  handleMenuSelection: () => Promise<void>;
  handleWorkspaceSelection: () => Promise<void>;
  handleWorkspaceItemSelection: () => Promise<void>;
  handleNotebookActionSelection: () => Promise<void>;
  handleJobMenuSelection: () => Promise<void>;
  checkJobStatus: () => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
}

export type ViewType = string;