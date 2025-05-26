import React, { useState, useCallback, useMemo, useEffect, ReactElement } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import type { Key } from 'ink';
import { exec, spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const execAsync = promisify(exec);

// ===== TYPE DEFINITIONS =====
interface Config {
  cacheTimeout: number;
  maxRetries: number;
  theme: string;
}

interface CommandResult {
  success: boolean;
  output: string;
  error?: string;
  command: string;
  duration?: number;
}

interface HistoryEntry {
  command: string;
  timestamp: string;
  success: boolean;
  output?: string;
}

interface WorkspaceItem {
  name: string;
  isNotebook: boolean;
}

interface NotebookInfo {
  name: string;
  workspace: string;
}

interface JobInfo {
  jobId: string;
  workspace: string;
  notebook: string;
  startTime: number;
}

interface StatusInfo {
  status: string;
  startTime: string | null;
  endTime: string | null;
  jobType: string | null;
}

interface CachedData<T = any> {
  data: T;
  timestamp: number;
}

interface State {
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

interface ExecuteCommandOptions {
  timeout?: number;
  skipCache?: boolean;
  silent?: boolean;
  env?: Record<string, string>;
}

interface MenuOption {
  label: string;
  command?: string;
  action?: string;
  view?: string;
}

interface StatusConfig {
  color: string;
  icon: string;
}

type InputHandler = (input: string, key: Key) => void;

// ===== CONSTANTS =====
const VIEWS = {
  MAIN: 'main',
  WORKSPACES: 'workspaces',
  WORKSPACE_ITEMS: 'workspace-items',
  NOTEBOOK_ACTIONS: 'notebook-actions',
  OUTPUT: 'output',
  COMMAND_HISTORY: 'command-history',
  JOB_MENU: 'job-menu',
  JOB_STATUS: 'job-status'
} as const;

type ViewType = typeof VIEWS[keyof typeof VIEWS];

const COLORS = {
  PRIMARY: 'cyan',
  SUCCESS: 'green',
  WARNING: 'yellow',
  ERROR: 'red',
  SECONDARY: 'gray',
  HIGHLIGHT_BG: 'cyan',
  SUCCESS_BG: 'green',
  WARNING_BG: 'yellow'
} as const;

const TIMEOUTS = {
  DEFAULT: 30000,
  WORKSPACE_LOAD: 15000,
  JOB_RUN: 600000, // 10 minutes
  ANIMATION: 500,
  PROGRESS_UPDATE: 200,
  RETRY_DELAY: 1000,
  LOADING_SCREEN: 1500
} as const;

const LIMITS = {
  CACHE_TIMEOUT: 300000,
  MAX_RETRIES: 2,
  PROGRESS_INCREMENT: 10,
  PROGRESS_MAX: 90,
  HISTORY_SIZE: 50,
  HISTORY_DISPLAY: 10,
  OUTPUT_PREVIEW: 200
} as const;

const STATUS_CONFIG: Record<string, StatusConfig> = {
  'Completed': { color: COLORS.SUCCESS, icon: '✅' },
  'Succeeded': { color: COLORS.SUCCESS, icon: '✅' },
  'Failed': { color: COLORS.ERROR, icon: '❌' },
  'InProgress': { color: COLORS.WARNING, icon: '🔄' },
  'NotStarted': { color: COLORS.WARNING, icon: '⏳' },
  'Unknown': { color: COLORS.WARNING, icon: '⏳' }
};

// ===== UI HELPERS =====
const h = React.createElement;

const createText = (props: any, text: string): ReactElement => h(Text, props, text);
const createBox = (props: any, children: ReactElement[]): ReactElement => h(Box, props, children);
const spacer = (key: string = 'spacer'): ReactElement => h(Box, { key, height: 1 });

const createMenuItem = (
  label: string,
  index: number,
  selectedIndex: number,
  bgColor: string = COLORS.HIGHLIGHT_BG
): ReactElement =>
  createText({
    key: `menu-item-${index}`,
    color: index === selectedIndex ? 'black' : 'white',
    backgroundColor: index === selectedIndex ? bgColor : undefined
  }, label);

const createErrorDisplay = (error: string, keyPrefix: string = ''): ReactElement[] => [
  createText({ key: `${keyPrefix}error-title`, color: COLORS.ERROR, bold: true }, '❌ Error:'),
  createText({ key: `${keyPrefix}error-text`, color: COLORS.ERROR }, error)
];

const createLoadingDisplay = (message: string = 'Loading...', keyPrefix: string = ''): ReactElement =>
  createText({ key: `${keyPrefix}loading`, color: COLORS.WARNING }, `⏳ ${message}`);

// ===== COMMAND BUILDERS =====
const CommandBuilder = {
  listWorkspaces: (): string => 'fab ls',
  help: (): string => 'fab --help',
  listWorkspace: (workspace: string): string => `fab ls "${workspace}.Workspace"`,

  job: {
    start: (workspace: string, notebook: string): string =>
      `fab job start ${workspace}.Workspace/${notebook}`,
    runSync: (workspace: string, notebook: string): string =>
      `fab job run /${workspace}.Workspace/${notebook}`,
    status: (workspace: string, notebook: string, jobId: string): string =>
      `fab job run-status /${workspace}.Workspace/${notebook} --id ${jobId}`,
    list: (workspace: string, notebook: string): string =>
      `fab job run-list /${workspace}.Workspace/${notebook}`
  }
};

// ===== CONFIGURATION =====
const CONFIG_DIR = path.join(os.homedir(), '.weave');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const HISTORY_FILE = path.join(CONFIG_DIR, 'history.json');

const loadConfig = async (): Promise<Config> => {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return { cacheTimeout: LIMITS.CACHE_TIMEOUT, maxRetries: LIMITS.MAX_RETRIES, theme: 'default' };
  }
};

const saveConfig = async (config: Config): Promise<void> => {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
};

// ===== PARSING UTILITIES =====
interface ParseLinesFilters {
  skipEmpty?: boolean;
  skipHeaders?: boolean;
  skipPatterns?: string[];
}

const ParsingUtils = {
  cleanOutput: (output: string): string => output
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\r\n/g, '\n')
    .trim(),

  parseLines: (output: string, filters: ParseLinesFilters = {}): string[] => {
    const defaultFilters: Required<ParseLinesFilters> = {
      skipEmpty: true,
      skipHeaders: true,
      skipPatterns: ['Listing', 'ID', '─']
    };

    const { skipEmpty, skipHeaders, skipPatterns } = { ...defaultFilters, ...filters };

    return output
      .split('\n')
      .map(line => line.trim())
      .filter(line => {
        if (skipEmpty && !line) return false;
        if (skipHeaders && skipPatterns.some(pattern => line.startsWith(pattern))) return false;
        return true;
      });
  },

  parseWorkspaces: (output: string): string[] => {
    return ParsingUtils.parseLines(output)
      .map(line => {
        if (line.includes('.')) {
          return line.split('.')[0].trim();
        }
        return line.trim();
      })
      .filter(name => name && name.length > 0);
  },

  parseWorkspaceItems: (output: string): string[] => {
    return ParsingUtils.parseLines(output)
      .filter(item => item && item.length > 0);
  },

  extractJobId: (output: string): string | null => {
    const match = output.match(/Job instance '([a-f0-9-]+)' created/i);
    return match ? match[1] : null;
  },

  extractGuid: (text: string): string | null => {
    const match = text.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
    return match ? match[1] : null;
  },

  parseJobStatus: (output: string): StatusInfo => {
    const lines = output.split('\n');
    let statusInfo: StatusInfo = {
      status: 'Unknown',
      startTime: null,
      endTime: null,
      jobType: null
    };

    for (const line of lines) {
      if (!line.trim() || line.includes('──────') || line.includes('id') || line.includes('itemId')) continue;

      if (ParsingUtils.extractGuid(line)) {
        const cleanLine = line.replace(/^\s*│\s*/, '').replace(/\s*│\s*$/, '').trim();

        // Extract status
        const statusMatch = cleanLine.match(/\b(InProgress|Completed|Failed|NotStarted|Succeeded)\b/i);
        if (statusMatch) {
          statusInfo.status = statusMatch[1];
        }

        // Extract job type
        const jobTypeMatch = cleanLine.match(/\b(RunNotebook|RunPipeline)\b/i);
        if (jobTypeMatch) {
          statusInfo.jobType = jobTypeMatch[1];
        }

        // Extract timestamps - look for various timestamp formats
        // Match ISO 8601 with or without timezone, or other common formats
        const timestamps = cleanLine.match(/\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g);
        if (timestamps && timestamps.length > 0) {
          // Normalize the timestamp to ensure it's parseable
          statusInfo.startTime = timestamps[0].replace(' ', 'T');
          if (!statusInfo.startTime.includes('Z') && !statusInfo.startTime.match(/[+-]\d{2}:?\d{2}$/)) {
            // If no timezone info, assume UTC
            statusInfo.startTime += 'Z';
          }

          if (timestamps.length > 1 && timestamps[timestamps.length - 1] !== timestamps[0]) {
            statusInfo.endTime = timestamps[timestamps.length - 1].replace(' ', 'T');
            if (!statusInfo.endTime.includes('Z') && !statusInfo.endTime.match(/[+-]\d{2}:?\d{2}$/)) {
              statusInfo.endTime += 'Z';
            }
          }
        }

        break;
      }
    }

    if (statusInfo.endTime === 'None' || statusInfo.endTime === statusInfo.startTime) {
      statusInfo.endTime = null;
    }

    return statusInfo;
  },

  formatDateTime: (dateTimeStr: string | null): string => {
    if (!dateTimeStr || dateTimeStr === 'None') return 'N/A';
    try {
      const date = new Date(dateTimeStr);
      // Check if the date is valid
      if (isNaN(date.getTime())) {
        console.error('Invalid date:', dateTimeStr);
        return dateTimeStr;
      }
      // Use 24-hour format in local timezone
      return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZoneName: 'short'
      });
    } catch (error) {
      console.error('Error formatting date:', error, dateTimeStr);
      return dateTimeStr;
    }
  },

  isNotebook: (item: string | WorkspaceItem): boolean => {
    return typeof item === 'string' ? item.endsWith('.Notebook') : item.isNotebook;
  }
};

// ===== HISTORY MANAGEMENT =====
const HistoryManager = {
  load: async (): Promise<HistoryEntry[]> => {
    try {
      const data = await fs.readFile(HISTORY_FILE, 'utf8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  save: async (history: HistoryEntry[]): Promise<void> => {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    await fs.writeFile(HISTORY_FILE, JSON.stringify(history.slice(0, LIMITS.HISTORY_SIZE), null, 2));
  },

  createEntry: (command: string, result: CommandResult): HistoryEntry => ({
    command,
    timestamp: new Date().toISOString(),
    success: result.success,
    output: result.output?.substring(0, LIMITS.OUTPUT_PREVIEW)
  }),

  formatTimestamp: (isoString: string): string => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch {
      return isoString;
    }
  }
};

// ===== NAVIGATION HELPER =====
const handleNavigation = (
  key: Key,
  currentIndex: number,
  maxIndex: number,
  setter: (index: number) => void
): void => {
  if (key.upArrow && currentIndex > 0) {
    setter(currentIndex - 1);
  } else if (key.downArrow && currentIndex < maxIndex) {
    setter(currentIndex + 1);
  }
};

// ===== STATE MANAGEMENT =====
const createInitialState = (): State => ({
  currentView: VIEWS.MAIN,
  selectedOption: 0,
  output: '',
  loading: false,
  error: '',
  workspaces: [],
  selectedWorkspace: 0,
  workspaceItems: [],
  selectedWorkspaceItem: 0,
  inInteractiveMode: false,
  commandHistory: [],
  loadingProgress: 0,
  config: null,
  activeJobs: [],
  currentJob: null,
  selectedJobOption: 0,
  selectedNotebookAction: 0,
  currentNotebook: null,
  completedJobs: new Set(),
  cache: new Map()
});

interface Actions {
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

const useWeaveState = (): { state: State; actions: Actions } => {
  const [state, setState] = useState<State>(createInitialState());

  useEffect(() => {
    const init = async () => {
      const [config, history] = await Promise.all([loadConfig(), HistoryManager.load()]);
      setState(prev => ({ ...prev, config, commandHistory: history }));
    };
    init();
  }, []);

  const actions = useMemo<Actions>(() => ({
    updateState: (updates: Partial<State>) => setState(prev => ({ ...prev, ...updates })),

    resetState: () => setState(prev => ({
      ...createInitialState(),
      config: prev.config,
      commandHistory: prev.commandHistory,
      cache: prev.cache
    })),

    setCurrentView: (view: ViewType) => setState(prev => ({ ...prev, currentView: view })),
    setSelectedOption: (option: number) => setState(prev => ({ ...prev, selectedOption: option })),
    setOutput: (output: string) => setState(prev => ({ ...prev, output })),
    setLoading: (loading: boolean) => setState(prev => ({ ...prev, loading })),
    setError: (error: string) => setState(prev => ({ ...prev, error })),
    setWorkspaces: (workspaces: string[]) => setState(prev => ({ ...prev, workspaces })),
    setSelectedWorkspace: (index: number) => setState(prev => ({ ...prev, selectedWorkspace: index })),
    setWorkspaceItems: (items: (string | WorkspaceItem)[]) => setState(prev => ({ ...prev, workspaceItems: items })),
    setSelectedWorkspaceItem: (index: number) => setState(prev => ({ ...prev, selectedWorkspaceItem: index })),
    setInInteractiveMode: (mode: boolean) => setState(prev => ({ ...prev, inInteractiveMode: mode })),
    setLoadingProgress: (progress: number | ((prev: number) => number)) => setState(prev => ({
      ...prev,
      loadingProgress: typeof progress === 'function' ? progress(prev.loadingProgress) : progress
    })),
    setConfig: (config: Config) => setState(prev => ({ ...prev, config })),
    setCurrentJob: (job: JobInfo | null) => setState(prev => ({ ...prev, currentJob: job })),
    setSelectedJobOption: (option: number) => setState(prev => ({ ...prev, selectedJobOption: option })),
    setSelectedNotebookAction: (action: number) => setState(prev => ({ ...prev, selectedNotebookAction: action })),
    setCurrentNotebook: (notebook: NotebookInfo | null) => setState(prev => ({ ...prev, currentNotebook: notebook })),

    addToHistory: async (command: string, result: CommandResult) => {
      const entry = HistoryManager.createEntry(command, result);
      setState(prev => {
        const newHistory = [entry, ...prev.commandHistory.slice(0, LIMITS.HISTORY_SIZE - 1)];
        HistoryManager.save(newHistory);
        return { ...prev, commandHistory: newHistory };
      });
    },

    getCachedData: <T = any>(key: string): T | null => {
      const cached = state.cache.get(key);
      const timeout = state.config?.cacheTimeout || LIMITS.CACHE_TIMEOUT;
      if (cached && Date.now() - cached.timestamp < timeout) {
        return cached.data as T;
      }
      return null;
    },

    setCachedData: <T = any>(key: string, data: T) => {
      setState(prev => {
        const newCache = new Map(prev.cache);
        newCache.set(key, { data, timestamp: Date.now() });
        return { ...prev, cache: newCache };
      });
    },

    addActiveJob: (jobId: string, workspace: string, notebook: string) => {
      setState(prev => ({
        ...prev,
        activeJobs: [...prev.activeJobs, { jobId, workspace, notebook, startTime: Date.now() }]
      }));
    },

    markJobCompleted: (workspace: string, notebook: string) => {
      const jobKey = `${workspace}/${notebook}`;
      setState(prev => ({
        ...prev,
        completedJobs: new Set([...prev.completedJobs, jobKey])
      }));
    },

    setCommandHistory: (history: HistoryEntry[]) => setState(prev => ({ ...prev, commandHistory: history }))
  }), [state.cache, state.config]);

  return { state, actions };
};

// ===== COMMAND EXECUTION =====
const useCommandExecution = (actions: Actions, config: Config | null) => {
  const executeCommand = useCallback(async (
    command: string,
    options: ExecuteCommandOptions = {}
  ): Promise<CommandResult> => {
    const cacheKey = `${command}-${JSON.stringify(options)}`;

    if (!options.skipCache) {
      const cachedResult = actions.getCachedData<CommandResult>(cacheKey);
      if (cachedResult) {
        if (!options.silent) {
          actions.setOutput(cachedResult.output);
          if (cachedResult.error) {
            actions.setError(cachedResult.error);
          }
        }
        return cachedResult;
      }
    }

    actions.setLoading(true);
    actions.setError('');

    const progressInterval = setInterval(() => {
      actions.setLoadingProgress((prev: number) => Math.min(prev + LIMITS.PROGRESS_INCREMENT, LIMITS.PROGRESS_MAX));
    }, TIMEOUTS.PROGRESS_UPDATE);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout || TIMEOUTS.DEFAULT);

      const { stdout, stderr } = await execAsync(command, {
        env: { ...process.env, FORCE_COLOR: '0', ...options.env },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const result: CommandResult = {
        success: !stderr?.trim(),
        output: ParsingUtils.cleanOutput(stdout),
        error: stderr?.trim(),
        command
      };

      if (result.success && !options.skipCache) {
        actions.setCachedData(cacheKey, result);
      }

      if (!options.silent) {
        if (result.success) {
          actions.setOutput(result.output);
        } else {
          actions.setError(result.error || '');
        }
      }

      actions.setLoadingProgress(100);
      await actions.addToHistory(command, result);

      return result;
    } catch (err: any) {
      const error = err.name === 'AbortError'
        ? 'Command timed out. Try again or check your connection.'
        : `Error executing command: ${err.message}`;

      const result: CommandResult = { success: false, error, command, output: '' };
      if (!options.silent) {
        actions.setError(error);
      }
      actions.setLoadingProgress(100);
      await actions.addToHistory(command, result);

      return result;
    } finally {
      clearInterval(progressInterval);
      actions.setLoading(false);
      setTimeout(() => actions.setLoadingProgress(0), TIMEOUTS.RETRY_DELAY);
    }
  }, [actions]);

  const executeCommandWithRetry = useCallback(async (
    command: string,
    options: ExecuteCommandOptions = {},
    maxRetries: number | null = null
  ): Promise<CommandResult> => {
    const retries = maxRetries ?? config?.maxRetries ?? LIMITS.MAX_RETRIES;
    let lastError: string = '';

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await executeCommand(command, {
          ...options,
          skipCache: attempt > 0
        });

        if (result.success) return result;
        lastError = result.error || '';

        if (attempt < retries) {
          actions.setError(`Attempt ${attempt + 1} failed. Retrying...`);
          await new Promise(resolve => setTimeout(resolve, TIMEOUTS.RETRY_DELAY * (attempt + 1)));
        }
      } catch (err: any) {
        lastError = err.message;
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, TIMEOUTS.RETRY_DELAY * (attempt + 1)));
        }
      }
    }

    actions.setError(`Command failed after ${retries + 1} attempts: ${lastError}`);
    return { success: false, error: lastError, command, output: '' };
  }, [executeCommand, actions, config]);

  const executeCommandWithStatusUpdates = useCallback(async (
    command: string,
    options: ExecuteCommandOptions = {}
  ): Promise<CommandResult> => {
    actions.setLoading(true);
    actions.setError('');

    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const child: ChildProcessWithoutNullStreams = spawn('sh', ['-c', command], {
        env: { ...process.env, FORCE_COLOR: '0', ...options.env }
      });

      let output = '';
      let error = '';
      let statusCount = 0;

      const statusInterval = setInterval(() => {
        statusCount++;
        const dots = '.'.repeat((statusCount % 3) + 1);
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        actions.setOutput(`🔄 Job is running${dots} (${elapsed}s elapsed)`);
      }, 1000);

      child.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString();
        output += chunk;

        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.includes('Completed') || line.includes('Failed')) {
            const cleanLine = line.trim();
            if (cleanLine) {
              const elapsed = Math.floor((Date.now() - startTime) / 1000);
              actions.setOutput(`✅ Job completed (${elapsed}s)`);
            }
          }
        }
      });

      child.stderr.on('data', (data: Buffer) => {
        error += data.toString();
      });

      child.on('close', async (code: number | null) => {
        clearInterval(statusInterval);
        actions.setLoading(false);

        const duration = Math.floor((Date.now() - startTime) / 1000);
        const result: CommandResult = {
          success: code === 0 && !error.trim(),
          output: ParsingUtils.cleanOutput(output),
          error: error.trim(),
          command,
          duration
        };

        await actions.addToHistory(command, result);

        if (code === 0) {
          resolve(result);
        } else {
          reject(new Error(error || `Command exited with code ${code}`));
        }
      });

      child.on('error', (err: Error) => {
        clearInterval(statusInterval);
        actions.setLoading(false);
        actions.setError(`Error executing command: ${err.message}`);
        reject(err);
      });

      if (options.timeout) {
        setTimeout(() => {
          clearInterval(statusInterval);
          child.kill();
          actions.setLoading(false);
          actions.setError('Command timed out');
          reject(new Error('Command timed out'));
        }, options.timeout);
      }
    });
  }, [actions]);

  return { executeCommand, executeCommandWithRetry, executeCommandWithStatusUpdates };
};

// ===== INPUT HANDLERS =====
interface Handlers {
  handleMenuSelection: () => Promise<void>;
  handleWorkspaceSelection: () => Promise<void>;
  handleWorkspaceItemSelection: () => Promise<void>;
  handleNotebookActionSelection: () => Promise<void>;
  handleJobMenuSelection: () => Promise<void>;
  checkJobStatus: () => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
}

const createInputHandlers = (
  state: State,
  actions: Actions,
  handlers: Handlers
): Record<string, InputHandler> => ({
  [VIEWS.MAIN]: (input: string, key: Key) => {
    handleNavigation(key, state.selectedOption, 3, actions.setSelectedOption);

    if (key.return) handlers.handleMenuSelection();
    else if (input === 'q' || key.escape) process.exit(0);
  },

  [VIEWS.WORKSPACES]: (input: string, key: Key) => {
    const maxSelection = state.workspaces.length;
    handleNavigation(key, state.selectedWorkspace, maxSelection, actions.setSelectedWorkspace);

    if (key.return) {
      if (state.selectedWorkspace === state.workspaces.length) {
        actions.setCurrentView(VIEWS.MAIN);
        actions.resetState();
      } else {
        handlers.handleWorkspaceSelection();
      }
    } else if (key.escape || input === 'q') {
      actions.setCurrentView(VIEWS.MAIN);
      actions.resetState();
    } else if (input === 'r') {
      handlers.refreshWorkspaces();
    }
  },

  [VIEWS.WORKSPACE_ITEMS]: (input: string, key: Key) => {
    if (key.escape || input === 'q') {
      actions.updateState({
        currentView: VIEWS.WORKSPACES,
        workspaceItems: [],
        selectedWorkspaceItem: 0
      });
      return;
    }

    const maxSelection = state.workspaceItems.length;
    handleNavigation(key, state.selectedWorkspaceItem, maxSelection, actions.setSelectedWorkspaceItem);

    if (key.return) {
      if (state.selectedWorkspaceItem === state.workspaceItems.length) {
        actions.updateState({
          currentView: VIEWS.WORKSPACES,
          workspaceItems: [],
          selectedWorkspaceItem: 0
        });
      } else {
        handlers.handleWorkspaceItemSelection();
      }
    }
  },

  [VIEWS.NOTEBOOK_ACTIONS]: (input: string, key: Key) => {
    handleNavigation(key, state.selectedNotebookAction, 3, actions.setSelectedNotebookAction);

    if (key.return) handlers.handleNotebookActionSelection();
    else if (key.escape || input === 'q') {
      actions.updateState({
        currentView: VIEWS.WORKSPACE_ITEMS,
        selectedNotebookAction: 0,
        currentNotebook: null
      });
    }
  },

  [VIEWS.JOB_MENU]: (input: string, key: Key) => {
    handleNavigation(key, state.selectedJobOption, 2, actions.setSelectedJobOption);

    if (key.return) handlers.handleJobMenuSelection();
    else if (key.escape || input === 'q') {
      actions.updateState({
        currentView: VIEWS.WORKSPACE_ITEMS,
        currentJob: null,
        selectedJobOption: 0
      });
    }
  },

  [VIEWS.JOB_STATUS]: (input: string, key: Key) => {
    if (key.return || key.escape || input === 'q') {
      actions.setCurrentView(VIEWS.JOB_MENU);
    } else if (input === 'r') {
      handlers.checkJobStatus();
    }
  },

  [VIEWS.COMMAND_HISTORY]: (input: string, key: Key) => {
    if (key.escape || input === 'q') {
      actions.setCurrentView(VIEWS.MAIN);
    } else if (input === 'c') {
      actions.setCommandHistory([]);
      HistoryManager.save([]);
    }
  },

  [VIEWS.OUTPUT]: (input: string, key: Key) => {
    if (key.escape || input === 'q') {
      if (state.currentNotebook) {
        actions.setCurrentView(VIEWS.NOTEBOOK_ACTIONS);
      } else {
        actions.setCurrentView(VIEWS.MAIN);
        actions.resetState();
      }
    }
  },

  default: (input: string, key: Key) => {
    if (key.escape || input === 'q') {
      actions.setCurrentView(VIEWS.MAIN);
      actions.resetState();
    }
  }
});

// ===== UI COMPONENTS =====
const AnimatedWeaveTitle: React.FC = React.memo(() => {
  const [frame, setFrame] = useState<number>(0);
  const [direction, setDirection] = useState<number>(1);

  useEffect(() => {
    const patterns = [
      'w   e   a   v   e',
      'w ─ e   a   v   e',
      'w ─ e ─ a   v   e',
      'w ─ e ─ a ─ v   e',
      'w ─ e ─ a ─ v ─ e',
      'w │ e ─ a ─ v ─ e',
      'w │ e │ a ─ v ─ e',
      'w │ e │ a │ v ─ e',
      'w │ e │ a │ v │ e'
    ];

    const interval = setInterval(() => {
      setFrame(prev => {
        const nextFrame = prev + direction;

        if (nextFrame >= patterns.length - 1) {
          setDirection(-1);
          return patterns.length - 1;
        }
        if (nextFrame <= 0) {
          setDirection(1);
          return 0;
        }

        return nextFrame;
      });
    }, TIMEOUTS.ANIMATION);

    return () => clearInterval(interval);
  }, [direction]);

  const patterns = [
    'w   e   a   v   e',
    'w ─ e   a   v   e',
    'w ─ e ─ a   v   e',
    'w ─ e ─ a ─ v   e',
    'w ─ e ─ a ─ v ─ e',
    'w │ e ─ a ─ v ─ e',
    'w │ e │ a ─ v ─ e',
    'w │ e │ a │ v ─ e',
    'w │ e │ a │ v │ e'
  ];

  return createText({ bold: true, color: COLORS.PRIMARY, fontSize: 24 }, patterns[frame]);
});

interface MainMenuProps {
  selectedOption: number;
}

const MainMenu: React.FC<MainMenuProps> = React.memo(({ selectedOption }) => {
  const menuOptions = useMemo(() => [
    { label: 'Workspaces', command: CommandBuilder.listWorkspaces(), view: VIEWS.WORKSPACES },
    { label: 'Manual Interactive Shell', action: 'interactive' },
    { label: 'Command History', action: 'history', view: VIEWS.COMMAND_HISTORY },
    { label: 'Exit', action: 'exit' }
  ], []);

  return createBox({ flexDirection: 'column', padding: 1 }, [
    h(AnimatedWeaveTitle, { key: 'title' }),
    spacer(),
    ...menuOptions.map((option, index) =>
      createMenuItem(option.label, index, selectedOption)
    )
  ]);
});

interface LoadingOrErrorProps {
  loading: boolean;
  error: string;
  loadingMessage?: string;
}

const LoadingOrError: React.FC<LoadingOrErrorProps> = ({ loading, error, loadingMessage = 'Loading...' }) => {
  if (loading) return createLoadingDisplay(loadingMessage);
  if (error) return createBox({ flexDirection: 'column' }, createErrorDisplay(error));
  return null;
};

interface WorkspacesListProps {
  workspaces: string[];
  selectedWorkspace: number;
  loading: boolean;
  error: string;
  loadingProgress: number;
}

const WorkspacesList: React.FC<WorkspacesListProps> = React.memo(({
  workspaces,
  selectedWorkspace,
  loading,
  error,
  loadingProgress
}) => {
  const elements: ReactElement[] = [
    createText({ key: 'title', bold: true, color: COLORS.PRIMARY }, 'Workspaces'),
    spacer()
  ];

  if (loading) {
    elements.push(createLoadingDisplay('Loading workspaces...', 'workspaces'));
  } else if (error) {
    elements.push(...createErrorDisplay(error, 'workspaces'));
    elements.push(
      createText({ key: 'retry-tip', color: COLORS.SECONDARY, italic: true },
        'Press Enter to retry or check your network connection'
      )
    );
  } else if (workspaces.length > 0) {
    elements.push(
      createText({ key: 'workspace-title', color: COLORS.SUCCESS, bold: true },
        `Found ${workspaces.length} workspace${workspaces.length === 1 ? '' : 's'}:`
      ),
      spacer('spacer2'),
      ...workspaces.map((workspace, index) =>
        createMenuItem(workspace, index, selectedWorkspace, COLORS.SUCCESS_BG)
      ),
      spacer('separator'),
      createMenuItem('Return to Main Menu', workspaces.length, selectedWorkspace, COLORS.SECONDARY)
    );
  } else if (!loading) {
    elements.push(
      createText({ key: 'no-workspaces', color: COLORS.WARNING }, '⚠️  No workspaces found'),
      createText({ key: 'refresh-tip', color: COLORS.SECONDARY, italic: true },
        'Press Enter to retry or check your fabric CLI setup'
      )
    );
  }

  return createBox({ flexDirection: 'column', padding: 1 }, elements);
});

interface WorkspaceItemsProps {
  items: (string | WorkspaceItem)[];
  selectedItem: number;
  workspaceName: string;
  loading: boolean;
  error: string;
}

const WorkspaceItems: React.FC<WorkspaceItemsProps> = React.memo(({
  items,
  selectedItem,
  workspaceName,
  loading,
  error
}) => {
  const elements: ReactElement[] = [
    createText({ key: 'title', bold: true, color: COLORS.PRIMARY }, 'Workspace Items'),
    spacer()
  ];

  if (loading) {
    elements.push(createLoadingDisplay('Loading workspace items...', 'items'));
  } else if (error) {
    elements.push(...createErrorDisplay(error, 'items'));
    elements.push(
      spacer('error-spacer'),
      createText({ key: 'return-instruction', color: COLORS.SECONDARY, italic: true },
        "Press 'q' or ESC to return to workspaces"
      )
    );
  } else if (items.length > 0) {
    const notebooks = items.filter(item => ParsingUtils.isNotebook(item));
    const others = items.filter(item => !ParsingUtils.isNotebook(item));

    elements.push(
      createText({ key: 'items-summary', color: COLORS.SECONDARY },
        `${notebooks.length} notebook${notebooks.length === 1 ? '' : 's'}, ${others.length} other item${others.length === 1 ? '' : 's'}`
      ),
      spacer('spacer2')
    );

    items.forEach((item, index) => {
      const itemObj = typeof item === 'string' ? { name: item, isNotebook: ParsingUtils.isNotebook(item) } : item;
      elements.push(
        createMenuItem(
          `${itemObj.name}${itemObj.isNotebook ? ' 📓' : ''}`,
          index,
          selectedItem,
          COLORS.WARNING_BG
        )
      );
    });

    elements.push(
      spacer('separator'),
      createMenuItem('Return to Workspaces', items.length, selectedItem, COLORS.SECONDARY)
    );
  } else if (!loading) {
    elements.push(
      createText({ key: 'no-items', color: COLORS.WARNING }, '⚠️  No items found in workspace'),
      spacer('empty-spacer'),
      createText({ key: 'empty-instruction', color: COLORS.SECONDARY, italic: true },
        "This workspace is empty. Press 'q' to return to workspaces"
      )
    );
  }

  return createBox({ flexDirection: 'column', padding: 1 }, elements);
});

interface CommandHistoryProps {
  history: HistoryEntry[];
}

const CommandHistory: React.FC<CommandHistoryProps> = React.memo(({ history }) => {
  const elements: ReactElement[] = [
    createText({ key: 'title', bold: true, color: COLORS.PRIMARY }, '📜 Command History'),
    createText({ key: 'instructions', color: COLORS.SECONDARY },
      "Press 'c' to clear history, 'q' to return to main menu"
    ),
    spacer()
  ];

  if (history.length === 0) {
    elements.push(
      createText({ key: 'no-history', color: COLORS.WARNING }, 'No command history yet')
    );
  } else {
    history.slice(0, LIMITS.HISTORY_DISPLAY).forEach((entry, index) => {
      const timeStr = HistoryManager.formatTimestamp(entry.timestamp);

      elements.push(
        createBox({ key: `entry-${index}`, flexDirection: 'column', marginBottom: 1 }, [
          createText({ key: 'time', color: COLORS.SECONDARY }, `[${timeStr}]`),
          createText({
            key: 'cmd',
            color: entry.success ? COLORS.SUCCESS : COLORS.ERROR
          }, `$ ${entry.command}`),
          ...(entry.output ? [createText({
            key: 'output',
            color: COLORS.SECONDARY,
            dimColor: true
          }, entry.output.substring(0, 80) + (entry.output.length > 80 ? '...' : ''))] : [])
        ])
      );
    });

    if (history.length > LIMITS.HISTORY_DISPLAY) {
      elements.push(
        createText({ key: 'more', color: COLORS.SECONDARY, italic: true },
          `... and ${history.length - LIMITS.HISTORY_DISPLAY} more entries`
        )
      );
    }
  }

  return createBox({ flexDirection: 'column', padding: 1 }, elements);
});

interface NotebookActionsMenuProps {
  notebook: string;
  workspace: string;
  selectedOption: number;
  completedJobs: Set<string>;
  activeJobs: JobInfo[];
  currentJob: JobInfo | null;
}

const NotebookActionsMenu: React.FC<NotebookActionsMenuProps> = React.memo(({
  notebook,
  workspace,
  selectedOption,
  completedJobs,
  activeJobs,
  currentJob
}) => {
  const jobKey = `${workspace}/${notebook}`;
  const hasJobCompleted = completedJobs && completedJobs.has(jobKey);

  const elements: ReactElement[] = [
    createText({ key: 'title', bold: true, color: COLORS.PRIMARY }, 'Notebook Actions'),
    spacer('spacer1'),
    createText({ key: 'notebook-info', color: COLORS.PRIMARY }, `📓 ${notebook}`),
    ...(hasJobCompleted ? [createText({ key: 'job-status', color: COLORS.SUCCESS }, `✅ Job has been run and completed`)] : []),
    spacer('spacer2'),
    createText({ key: 'menu-title', color: COLORS.PRIMARY, bold: true }, 'What would you like to do?'),
    spacer('spacer3')
  ];

  const options = [
    'Run (Start job in background)',
    'Run Job Synchronously (Wait for completion)',
    'View Last Job Details'
  ];

  options.forEach((option, index) => {
    elements.push(createMenuItem(option, index, selectedOption, COLORS.WARNING_BG));
  });

  elements.push(
    spacer('separator'),
    createMenuItem('Return to Workspace Items', options.length, selectedOption, COLORS.SECONDARY)
  );

  return createBox({ flexDirection: 'column', padding: 1 }, elements.filter(Boolean));
});

interface JobMenuProps {
  job: JobInfo;
  selectedOption: number;
}

const JobMenu: React.FC<JobMenuProps> = React.memo(({ job, selectedOption }) => {
  const elements: ReactElement[] = [
    createText({ key: 'title', bold: true, color: COLORS.SUCCESS }, '✅ Job Started Successfully!'),
    spacer('spacer1'),
    createText({ key: 'job-info', color: COLORS.PRIMARY }, `📓 Notebook: ${job.notebook}`),
    createText({ key: 'workspace-info', color: COLORS.PRIMARY }, `📁 Workspace: ${job.workspace}`),
    createText({ key: 'job-id', color: COLORS.SECONDARY }, `🔖 Job ID: ${job.jobId}`),
    spacer('spacer2'),
    createText({ key: 'menu-title', color: COLORS.PRIMARY, bold: true }, 'What would you like to do?'),
    spacer('spacer3')
  ];

  const options = [
    'Check Job Status',
    'Run Job Synchronously (Wait for completion)',
    'Return to Workspace Items'
  ];

  options.forEach((option, index) => {
    elements.push(createMenuItem(option, index, selectedOption, COLORS.WARNING_BG));
  });

  elements.push(
    spacer('spacer4'),
    createText({ key: 'instructions', color: COLORS.SECONDARY, italic: true },
      'Use ↑/↓ to navigate, Enter to select'
    )
  );

  return createBox({ flexDirection: 'column', padding: 1 }, elements);
});

interface JobStatusViewProps {
  output: string;
  jobInfo: JobInfo;
  loading: boolean;
  error: string;
}

const JobStatusView: React.FC<JobStatusViewProps> = React.memo(({ output, jobInfo, loading, error }) => {
  const elements: ReactElement[] = [
    createText({ key: 'title', bold: true, color: COLORS.PRIMARY }, '📊 Job Status'),
    createText({ key: 'job-info', color: COLORS.SECONDARY }, `Notebook: ${jobInfo.notebook}`),
    spacer()
  ];

  const loadingOrError = h(LoadingOrError, {
    key: 'loading-error',
    loading,
    error,
    loadingMessage: 'Checking job status...'
  });

  if (loadingOrError) {
    elements.push(loadingOrError);
  } else if (output) {
    const statusInfo = ParsingUtils.parseJobStatus(output);
    const statusConfig = STATUS_CONFIG[statusInfo.status] || STATUS_CONFIG['Unknown'];

    elements.push(
      createText({ key: 'status', bold: true, color: statusConfig.color },
        `${statusConfig.icon} Status: ${statusInfo.status}`
      ),
      createText({ key: 'start-time', color: COLORS.PRIMARY },
        `🕐 Start Time: ${ParsingUtils.formatDateTime(statusInfo.startTime)}`
      ),
      createText({ key: 'end-time', color: COLORS.PRIMARY },
        `🏁 End Time: ${statusInfo.endTime ? ParsingUtils.formatDateTime(statusInfo.endTime) : 'Still running...'}`
      )
    );

    if (statusInfo.status === 'InProgress') {
      elements.push(
        spacer('spacer3'),
        createText({ key: 'duration', color: COLORS.SECONDARY, italic: true },
          `Running for ${Math.floor((Date.now() - jobInfo.startTime) / 1000)} seconds...`
        )
      );
    }
  }

  elements.push(
    spacer('spacer-final'),
    createText({ key: 'instructions', color: COLORS.SECONDARY, italic: true },
      "Press 'r' to refresh, Enter to return to job menu, 'q' to return to main menu"
    )
  );

  return createBox({ flexDirection: 'column', padding: 1 }, elements);
});

interface OutputViewProps {
  output: string;
  error: string;
  loading: boolean;
  title?: string;
  activeJobs: JobInfo[];
  currentNotebook: NotebookInfo | null;
}

const OutputView: React.FC<OutputViewProps> = React.memo(({
  output,
  error,
  loading,
  title,
  activeJobs,
  currentNotebook
}) => {
  const elements: ReactElement[] = [];

  if (error) {
    elements.push(...createErrorDisplay(error));
  }

  if (output) {
    const lines = output.split('\n');
    lines.forEach((line, index) => {
      if (line.trim()) {
        let color: string = COLORS.PRIMARY;
        let bold = false;

        if (line.includes('🔄') || line.includes('Starting')) {
          color = COLORS.PRIMARY;
          bold = true;
        } else if (line.includes('⏳') || line.includes('running')) {
          color = COLORS.WARNING;
        } else if (line.includes('✅') || line.includes('completed')) {
          color = COLORS.SUCCESS;
          bold = true;
        } else if (line.includes('❌') || line.includes('failed')) {
          color = COLORS.ERROR;
          bold = true;
        } else if (line.includes('💡 Press')) {
          color = COLORS.SECONDARY;
        }

        elements.push(createText({ key: `line-${index}`, color, bold }, line));
      } else {
        elements.push(spacer(`spacer-${index}`));
      }
    });
  }

  if (!loading && !output && !error) {
    elements.push(createText({ key: 'no-output', color: COLORS.WARNING }, 'No output received'));
  }

  return createBox({ flexDirection: 'column', padding: 1, height: '100%', overflowY: 'hidden' }, elements);
});

const LoadingScreen: React.FC = React.memo(() => {
  const [version, setVersion] = useState<string>('v0.1.3');

  useEffect(() => {
    const loadVersion = async () => {
      try {
        // Go up one level from dist/ to project root
        const packageJsonPath = path.resolve(__dirname, '../package.json');
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
        setVersion(`v${packageJson.version}`);
      } catch (error) {
        console.error('Failed to load version from package.json:', error);
      }
    };

    loadVersion();
  }, []);

  const asciiArt = `
██╗    ██╗███████╗ █████╗ ██╗   ██╗███████╗
██║    ██║██╔════╝██╔══██╗██║   ██║██╔════╝
██║ █╗ ██║█████╗  ███████║██║   ██║█████╗  
██║███╗██║██╔══╝  ██╔══██║╚██╗ ██╔╝██╔══╝  
╚███╔███╔╝███████╗██║  ██║ ╚████╔╝ ███████╗
 ╚══╝╚══╝ ╚══════╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝`;

  return createBox({
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%'
  }, [
    createText({ key: 'ascii', color: COLORS.PRIMARY, bold: true }, asciiArt),
    createText({ key: 'version', color: COLORS.SECONDARY, dimColor: true }, version)
  ]);
});

// ===== MAIN APPLICATION =====
const weave: React.FC = () => {
  const { state, actions } = useWeaveState();
  const { executeCommand, executeCommandWithRetry, executeCommandWithStatusUpdates } = useCommandExecution(actions, state.config);
  const { exit } = useApp();
  const [showLoadingScreen, setShowLoadingScreen] = useState<boolean>(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowLoadingScreen(false), TIMEOUTS.LOADING_SCREEN);
    return () => clearTimeout(timer);
  }, []);

  const handleInteractiveShell = useCallback(() => {
    exit();
    setTimeout(() => {
      console.clear();
      console.log('Starting Fabric Interactive Shell...');
      console.log('When you exit, run "weave" (if installed via homebrew), "npm start" or "node weave.js" to restart the TUI.\n');

      const child = spawn('fab', ['auth', 'login'], {
        stdio: 'inherit',
        shell: true,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          FORCE_COLOR: '1',
          FABRIC_DISABLE_CPR: '1'
        }
      });

      const handleExit = () => {
        console.log('\nInteractive shell closed.');
        console.log('Run "weave" (if installed via homebrew), "npm start" or "node weave.js" to restart the TUI.');
        process.exit(0);
      };

      child.on('close', handleExit);
      child.on('exit', handleExit);
      child.on('error', (err: Error) => {
        console.error('Error starting interactive shell:', err.message);
        console.log('Run "weave" (if installed via homebrew), "npm start" or "node weave.js" to restart the TUI.');
        process.exit(1);
      });
    }, 100);
  }, [exit]);

  const menuOptions: MenuOption[] = [
    { label: 'Workspaces', command: CommandBuilder.listWorkspaces(), view: VIEWS.WORKSPACES },
    { label: 'Manual Interactive Shell', action: 'interactive' },
    { label: 'Command History', action: 'history', view: VIEWS.COMMAND_HISTORY },
    { label: 'Exit', action: 'exit' }
  ];

  const handleMenuSelection = useCallback(async () => {
    const selected = menuOptions[state.selectedOption];

    if (selected.action === 'exit') {
      process.exit(0);
      return;
    }

    if (selected.action === 'interactive') {
      handleInteractiveShell();
      return;
    }

    if (selected.action === 'history') {
      actions.setCurrentView(VIEWS.COMMAND_HISTORY);
      return;
    }

    actions.setCurrentView((selected.view as ViewType) || VIEWS.OUTPUT);
    actions.setWorkspaces([]);
    actions.setSelectedWorkspace(0);

    const result = selected.command === CommandBuilder.listWorkspaces()
      ? await executeCommandWithRetry(selected.command!, { timeout: TIMEOUTS.WORKSPACE_LOAD })
      : await executeCommand(selected.command!);

    if (result.success && selected.command === CommandBuilder.listWorkspaces()) {
      const workspaceList = ParsingUtils.parseWorkspaces(result.output);
      actions.setWorkspaces(workspaceList);
    }
  }, [state.selectedOption, actions, executeCommand, executeCommandWithRetry, handleInteractiveShell]);

  const handleWorkspaceSelection = useCallback(async () => {
    if (state.workspaces.length === 0) return;

    const selectedWorkspaceName = state.workspaces[state.selectedWorkspace];
    const command = CommandBuilder.listWorkspace(selectedWorkspaceName);

    actions.updateState({
      currentView: VIEWS.WORKSPACE_ITEMS,
      workspaceItems: [],
      selectedWorkspaceItem: 0
    });

    const result = await executeCommand(command);

    if (result.success) {
      const items = ParsingUtils.parseWorkspaceItems(result.output);
      actions.setWorkspaceItems(items);
    } else {
      actions.setCurrentView(VIEWS.WORKSPACES);
    }
  }, [state.workspaces, state.selectedWorkspace, actions, executeCommand]);

  const handleWorkspaceItemSelection = useCallback(async () => {
    if (state.workspaceItems.length === 0) return;

    const selectedItem = state.workspaceItems[state.selectedWorkspaceItem];
    const selectedWorkspaceName = state.workspaces[state.selectedWorkspace];

    const itemName = typeof selectedItem === 'string' ? selectedItem : selectedItem.name;
    const isNotebook = ParsingUtils.isNotebook(selectedItem);

    if (isNotebook) {
      actions.updateState({
        currentNotebook: { name: itemName, workspace: selectedWorkspaceName },
        selectedNotebookAction: 0,
        currentView: VIEWS.NOTEBOOK_ACTIONS
      });
    } else {
      actions.setError(`Selected item "${itemName}" is not a notebook. Only .Notebook items can be started.`);
      actions.setCurrentView(VIEWS.OUTPUT);
    }
  }, [state.workspaceItems, state.selectedWorkspaceItem, state.workspaces, state.selectedWorkspace, actions]);

  const handleNotebookActionSelection = useCallback(async () => {
    if (!state.currentNotebook) return;

    const actionHandlers: Record<number, () => Promise<void> | void> = {
      0: async () => { // Run in background
        const command = CommandBuilder.job.start(state.currentNotebook!.workspace, state.currentNotebook!.name);
        actions.setCurrentView(VIEWS.OUTPUT);
        actions.setOutput('🚀 Starting job in background...');

        const result = await executeCommand(command, { silent: true });

        if (result.success) {
          const jobId = ParsingUtils.extractJobId(result.output);
          if (jobId) {
            actions.addActiveJob(jobId, state.currentNotebook!.workspace, state.currentNotebook!.name);
            actions.setOutput(
              `✅ Job started successfully in background\n\n` +
              `📍 Job ID: ${jobId}\n\n` +
              `💡 Use 'View Last Job Details' to check status\n\n` +
              `💡 Press 'q' or ESC to return to notebook actions menu`
            );
          } else {
            actions.setOutput(`❌ Failed to extract job ID\n\n💡 Press 'q' or ESC to return to notebook actions menu`);
          }
        } else {
          actions.setOutput(`❌ Failed to start job: ${result.error}\n\n💡 Press 'q' or ESC to return to notebook actions menu`);
        }
      },

      1: async () => { // Run synchronously
        const command = CommandBuilder.job.runSync(state.currentNotebook!.workspace, state.currentNotebook!.name);
        actions.setCurrentView(VIEWS.OUTPUT);
        actions.setOutput('🔄 Starting synchronous job execution...\n');

        try {
          const result = await executeCommandWithStatusUpdates(command, { timeout: TIMEOUTS.JOB_RUN });

          if (result.success) {
            actions.markJobCompleted(state.currentNotebook!.workspace, state.currentNotebook!.name);
            actions.setOutput(
              `✅ Job completed successfully (${result.duration}s)\n\n` +
              `💡 Press 'q' or ESC to return to notebook actions menu`
            );
          }
        } catch (error: any) {
          actions.markJobCompleted(state.currentNotebook!.workspace, state.currentNotebook!.name);
          actions.setOutput(`❌ Job failed: ${error.message}\n\n💡 Press 'q' or ESC to return to notebook actions menu`);
        }
      },

      2: async () => { // View last job details
        const listCommand = CommandBuilder.job.list(state.currentNotebook!.workspace, state.currentNotebook!.name);
        actions.setCurrentView(VIEWS.OUTPUT);
        actions.setOutput('🔍 Getting job details...');

        const listResult = await executeCommand(listCommand, { skipCache: true, silent: true });
        if (listResult.success) {
          const jobId = ParsingUtils.extractGuid(listResult.output);

          if (jobId) {
            const statusCommand = CommandBuilder.job.status(state.currentNotebook!.workspace, state.currentNotebook!.name, jobId);
            const statusResult = await executeCommand(statusCommand, { skipCache: true });

            if (statusResult.success) {
              const statusInfo = ParsingUtils.parseJobStatus(statusResult.output);

              actions.setOutput(
                `📊 Last Job Details:\n\n` +
                `🔖 Job ID: ${jobId}\n` +
                `📋 Status: ${statusInfo.status}\n` +
                `🕐 Start Time: ${ParsingUtils.formatDateTime(statusInfo.startTime)}\n` +
                `🏁 End Time: ${statusInfo.endTime ? ParsingUtils.formatDateTime(statusInfo.endTime) : 'Still running...'}\n\n` +
                `💡 Press 'q' or ESC to return to notebook actions menu`
              );
            } else {
              actions.setOutput(`❌ Failed to get job details\n\n💡 Press 'q' or ESC to return to notebook actions menu`);
            }
          } else {
            actions.setOutput(`ℹ️ No job history found for this notebook\n\n💡 Press 'q' or ESC to return to notebook actions menu`);
          }
        } else {
          actions.setOutput(`❌ Failed to get job list\n\n💡 Press 'q' or ESC to return to notebook actions menu`);
        }
      },

      3: () => { // Return
        actions.updateState({
          currentView: VIEWS.WORKSPACE_ITEMS,
          selectedNotebookAction: 0,
          currentNotebook: null
        });
      }
    };

    const handler = actionHandlers[state.selectedNotebookAction];
    if (handler) await handler();
  }, [state.currentNotebook, state.selectedNotebookAction, actions, executeCommand, executeCommandWithStatusUpdates]);

  const checkJobStatus = useCallback(async () => {
    if (!state.currentJob) return;

    const command = CommandBuilder.job.status(
      state.currentJob.workspace,
      state.currentJob.notebook,
      state.currentJob.jobId
    );

    const result = await executeCommand(command, { skipCache: true });

    if (result.success) {
      const statusInfo = ParsingUtils.parseJobStatus(result.output);
      if (['Completed', 'Succeeded', 'Failed'].includes(statusInfo.status)) {
        actions.markJobCompleted(state.currentJob.workspace, state.currentJob.notebook);
      }
    }
  }, [state.currentJob, executeCommand, actions]);

  const handleJobMenuSelection = useCallback(async () => {
    if (!state.currentJob) return;

    const actionHandlers: Record<number, () => Promise<void> | void> = {
      0: async () => { // Check status
        actions.setCurrentView(VIEWS.JOB_STATUS);
        await checkJobStatus();
      },

      1: async () => { // Run synchronously
        const command = CommandBuilder.job.runSync(state.currentJob!.workspace, state.currentJob!.notebook);
        actions.setCurrentView(VIEWS.OUTPUT);
        actions.setOutput('🔄 Starting synchronous job execution...\n');

        try {
          const result = await executeCommandWithStatusUpdates(command, { timeout: TIMEOUTS.JOB_RUN });
          if (result.success) {
            actions.setOutput(
              `✅ Job completed successfully (${result.duration}s)\n\n` +
              `💡 Press 'q' or ESC to return to main menu`
            );
          }
        } catch (error: any) {
          actions.setOutput(`❌ Job failed: ${error.message}\n\n💡 Press 'q' or ESC to return to main menu`);
        }
      },

      2: () => { // Return
        actions.updateState({
          currentView: VIEWS.WORKSPACE_ITEMS,
          selectedJobOption: 0
        });
      }
    };

    const handler = actionHandlers[state.selectedJobOption];
    if (handler) await handler();
  }, [state.currentJob, state.selectedJobOption, actions, checkJobStatus, executeCommandWithStatusUpdates]);

  const refreshWorkspaces = useCallback(async () => {
    const result = await executeCommandWithRetry(CommandBuilder.listWorkspaces(), {
      timeout: TIMEOUTS.WORKSPACE_LOAD,
      skipCache: true
    });

    if (result.success) {
      const workspaceList = ParsingUtils.parseWorkspaces(result.output);
      actions.setWorkspaces(workspaceList);
    }
  }, [executeCommandWithRetry, actions]);

  const handlers: Handlers = useMemo(() => ({
    handleMenuSelection,
    handleWorkspaceSelection,
    handleWorkspaceItemSelection,
    handleNotebookActionSelection,
    handleJobMenuSelection,
    checkJobStatus,
    refreshWorkspaces
  }), [
    handleMenuSelection,
    handleWorkspaceSelection,
    handleWorkspaceItemSelection,
    handleNotebookActionSelection,
    handleJobMenuSelection,
    checkJobStatus,
    refreshWorkspaces
  ]);

  const inputHandlers = createInputHandlers(state, actions, handlers);
  const currentInputHandler = inputHandlers[state.currentView] || inputHandlers.default;

  useInput((input: string, key: Key) => {
    if (state.inInteractiveMode) return;
    currentInputHandler(input, key);
    if (input === 'q' && state.currentView === VIEWS.MAIN) exit();
  });

  if (state.inInteractiveMode) return createBox({}, []);
  if (showLoadingScreen) return h(LoadingScreen);

  const viewComponents: Record<string, () => ReactElement> = {
    [VIEWS.MAIN]: () => h(MainMenu, { selectedOption: state.selectedOption }),
    [VIEWS.WORKSPACES]: () => h(WorkspacesList, {
      workspaces: state.workspaces,
      selectedWorkspace: state.selectedWorkspace,
      loading: state.loading,
      error: state.error,
      loadingProgress: state.loadingProgress
    }),
    [VIEWS.WORKSPACE_ITEMS]: () => h(WorkspaceItems, {
      items: state.workspaceItems,
      selectedItem: state.selectedWorkspaceItem,
      workspaceName: state.workspaces[state.selectedWorkspace],
      loading: state.loading,
      error: state.error
    }),
    [VIEWS.COMMAND_HISTORY]: () => h(CommandHistory, { history: state.commandHistory }),
    [VIEWS.NOTEBOOK_ACTIONS]: () => h(NotebookActionsMenu, {
      notebook: state.currentNotebook?.name || '',
      workspace: state.currentNotebook?.workspace || '',
      selectedOption: state.selectedNotebookAction,
      completedJobs: state.completedJobs,
      activeJobs: state.activeJobs,
      currentJob: state.currentJob
    }),
    [VIEWS.JOB_MENU]: () => h(JobMenu, {
      job: state.currentJob!,
      selectedOption: state.selectedJobOption
    }),
    [VIEWS.JOB_STATUS]: () => h(JobStatusView, {
      output: state.output,
      jobInfo: state.currentJob!,
      loading: state.loading,
      error: state.error
    }),
    [VIEWS.OUTPUT]: () => h(OutputView, {
      output: state.output,
      error: state.error,
      loading: state.loading,
      title: state.currentNotebook ? 'Job Output' : menuOptions[state.selectedOption]?.label,
      activeJobs: state.activeJobs,
      currentNotebook: state.currentNotebook
    })
  };

  const Component = viewComponents[state.currentView] || viewComponents[VIEWS.MAIN];
  return Component();
};

// Clear console and render
console.clear();
render(h(weave)); 
