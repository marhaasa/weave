import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useInput, useApp } from 'ink';
import { spawn } from 'child_process';
import type { Key } from 'ink';

// Hooks
import { useWeaveState } from './hooks/useWeaveState.js';
import { useCommandExecution } from './hooks/useCommandExecution.js';
import { createInputHandlers } from './hooks/useInputHandlers.js';

// Components
import { LoadingScreen } from './components/LoadingScreen.js';
import { MainMenu } from './components/MainMenu.js';
import { WorkspacesList } from './components/WorkspacesList.js';
import { WorkspaceItems } from './components/WorkspaceItems.js';
import { CommandHistory } from './components/CommandHistory.js';
import { NotebookActionsMenu } from './components/NotebookActionsMenu.js';
import { JobMenu } from './components/JobMenu.js';
import { JobStatusView } from './components/JobStatusView.js';
import { OutputView } from './components/OutputView.js';

// Utils and Constants
import { h, createBox } from './utils/uiHelpers.js';
import { CommandBuilder } from './utils/commandBuilder.js';
import { ParsingUtils } from './utils/parsing.js';
import { VIEWS, TIMEOUTS, LIMITS } from './constants/index.js';
import type { MenuOption, Handlers } from './types/index.js';

export const App: React.FC = () => {
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

    actions.setCurrentView(selected.view || VIEWS.OUTPUT);
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
      0: async () => {
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

      1: async () => {
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

      2: async () => {
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
                `🚀 Start Time: ${ParsingUtils.formatDateTime(statusInfo.startTime)}\n` +
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

      3: () => {
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
      0: async () => {
        actions.setCurrentView(VIEWS.JOB_STATUS);
        await checkJobStatus();
      },

      1: async () => {
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

      2: () => {
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

  const viewComponents: Record<string, () => React.ReactElement> = {
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