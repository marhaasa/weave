import { useState, useEffect, useMemo } from 'react';
import type { State, Actions, CommandResult, HistoryEntry, Config, JobInfo, ItemInfo, WorkspaceItem } from '../types/index.js';
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
  selectedDestinationWorkspace: 0,
  isMovingItem: true,
  exportPath: '',
  importPath: '',
  importItemName: '',
  selectedPathOption: 0,
  textInputValue: '',
  textInputContext: ''
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
    setSelectedDestinationWorkspace: (index: number) => setState(prev => ({ ...prev, selectedDestinationWorkspace: index })),
    setExportPath: (path: string) => setState(prev => ({ ...prev, exportPath: path })),
    setImportPath: (path: string) => setState(prev => ({ ...prev, importPath: path })),
    setImportItemName: (name: string) => setState(prev => ({ ...prev, importItemName: name })),
    setSelectedPathOption: (option: number) => setState(prev => ({ ...prev, selectedPathOption: option })),
    setTextInputValue: (value: string) => setState(prev => ({ ...prev, textInputValue: value })),
    setTextInputContext: (context: string) => setState(prev => ({ ...prev, textInputContext: context }))
  }), [state.config]);

  return { state, actions };
};