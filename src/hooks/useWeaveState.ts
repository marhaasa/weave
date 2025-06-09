import { useState, useEffect, useMemo } from 'react';
import type { State, Actions, CommandResult, HistoryEntry, Config, JobInfo, ItemInfo, WorkspaceItem, CachedData } from '../types/index.js';
import { VIEWS, LIMITS } from '../constants/index.js';
import { loadConfig } from '../services/config.js';
import { HistoryManager } from '../services/history.js';

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
  selectedItemAction: 0,
  currentItem: null,
  completedJobs: new Set(),
  cache: new Map(),
  selectedDestinationWorkspace: 0
});

export const useWeaveState = (): { state: State; actions: Actions } => {
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

    setCurrentView: (view: string) => setState(prev => ({ ...prev, currentView: view })),
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
    setSelectedItemAction: (action: number) => setState(prev => ({ ...prev, selectedItemAction: action })),
    setCurrentItem: (item: ItemInfo | null) => setState(prev => ({ ...prev, currentItem: item })),

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

    setCommandHistory: (history: HistoryEntry[]) => setState(prev => ({ ...prev, commandHistory: history })),
    setSelectedDestinationWorkspace: (index: number) => setState(prev => ({ ...prev, selectedDestinationWorkspace: index }))
  }), [state.cache, state.config]);

  return { state, actions };
};