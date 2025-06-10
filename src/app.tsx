import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useInput, useApp, useStdout } from 'ink';
import { spawn } from 'child_process';
import type { Key } from 'ink';
import { appendFileSync } from 'fs';


// Hooks
import { useWeaveState } from './hooks/useWeaveState.js';
import { useCommandExecution } from './hooks/useCommandExecution.js';
import { createInputHandlers } from './hooks/useInputHandlers.js';
import { useFabricService } from './hooks/useFabricService.js';
import { useSmartJobPolling } from './hooks/useJobPolling.js';
import { useDebouncedAsync } from './hooks/useDebounced.js';


// Components
import { LoadingScreen } from './components/LoadingScreen.js';
import { MainMenu } from './components/MainMenu.js';
import { WorkspacesList } from './components/WorkspacesList.js';
import { WorkspaceItems } from './components/WorkspaceItems.js';
import { CommandHistory } from './components/CommandHistory.js';
import { ItemActionsMenu } from './components/ItemActionsMenu.js';
import { JobMenu } from './components/JobMenu.js';
import { JobStatusView } from './components/JobStatusView.js';
import { OutputView } from './components/OutputView.js';
import { WorkspaceSelection } from './components/WorkspaceSelection.js';

// Utils and Constants
import { h, createBox } from './utils/uiHelpers.js';
import { CommandBuilder } from './utils/commandBuilder.js';
import { ParsingUtils } from './utils/parsing.js';
import { VIEWS, TIMEOUTS, LIMITS } from './constants/index.js';
import type { MenuOption, Handlers } from './types/index.js';
import { FabricService } from './services/fabricService.js';

const debugLog = (message: string) => {
  if (!process.env.WEAVE_DEBUG) return;
  
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${message}\n`;
  try {
    appendFileSync('/tmp/weave-debug.log', logMessage);
  } catch (error) {
    // Ignore file write errors
  }
};

export const App: React.FC = () => {
  const { state, actions } = useWeaveState();
  const { executeCommand, executeCommandWithRetry, executeCommandWithStatusUpdates } = useCommandExecution(actions, state.config);
  const fabricService = useFabricService(executeCommand);

  const { exit } = useApp();
  const { stdout } = useStdout();
  const [showLoadingScreen, setShowLoadingScreen] = useState<boolean>(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowLoadingScreen(false), TIMEOUTS.LOADING_SCREEN);
    return () => clearTimeout(timer);
  }, []);

  // Job polling to track active job statuses
  useSmartJobPolling({
    activeJobs: state.activeJobs,
    fabricService,
    onJobStatusUpdate: useCallback((jobId: string, statusInfo) => {
      // Update UI if needed when job status changes
      if (state.currentJob?.jobId === jobId) {
        // Could trigger a refresh of job status view if currently displayed
      }
    }, [state.currentJob]),
    onJobCompleted: useCallback((workspace: string, itemName: string) => {
      actions.markJobCompleted(workspace, itemName);
    }, [actions, fabricService])
  });

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

        try {
          if (selected.command === CommandBuilder.listWorkspaces()) {
            const workspaceList = await fabricService.listWorkspaces();
            actions.setWorkspaces(workspaceList);
          }
        } catch (error: any) {
          actions.setError(error.message);
        }
    }, [state.selectedOption, actions, fabricService, handleInteractiveShell]);

  const menuOptions: MenuOption[] = [
    { label: 'Workspaces', command: CommandBuilder.listWorkspaces(), view: VIEWS.WORKSPACES },
    { label: 'Manual Interactive Shell', action: 'interactive' },
    { label: 'Command History', action: 'history', view: VIEWS.COMMAND_HISTORY },
    { label: 'Exit', action: 'exit' }
  ];

  const handleWorkspaceSelection = useCallback(async (forceRefresh = false) => {
        if (state.workspaces.length === 0) return;

        const selectedWorkspaceName = state.workspaces[state.selectedWorkspace];
        debugLog(`handleWorkspaceSelection called for: ${selectedWorkspaceName}`);

        // Always clear existing items and show we're loading fresh data
        actions.updateState({
          currentView: VIEWS.WORKSPACE_ITEMS,
          workspaceItems: [],
          selectedWorkspaceItem: 0,
          loading: false, // Don't show loading immediately
          error: '' // Clear any lingering error state
        });

        // Only show loading if the operation takes longer than 200ms
        const loadingTimer = setTimeout(() => {
          actions.setLoading(true);
          
          // Start a timer to update loading progress for skeleton animation
          const progressTimer = setInterval(() => {
            actions.setLoadingProgress((prev: number) => (prev + 10) % 100);
          }, 300);
          
          // Store the progress timer for cleanup
          (loadingTimer as any).progressTimer = progressTimer;
        }, 200);

        try {
          const items = await fabricService.listWorkspaceItems(selectedWorkspaceName, forceRefresh);
          clearTimeout(loadingTimer);
          if ((loadingTimer as any).progressTimer) {
            clearInterval((loadingTimer as any).progressTimer);
          }
          
          actions.updateState({
            workspaceItems: items,
            loading: false,
            loadingProgress: 0
          });
        } catch (error: any) {
          clearTimeout(loadingTimer);
          if ((loadingTimer as any).progressTimer) {
            clearInterval((loadingTimer as any).progressTimer);
          }
          actions.setError(error.message);
          actions.setLoading(false);
          actions.setLoadingProgress(0);
          actions.setCurrentView(VIEWS.WORKSPACES);
        }
    }, [state.workspaces, state.selectedWorkspace, actions, fabricService]);

  const handleWorkspaceItemSelection = useCallback(async () => {
        if (state.workspaceItems.length === 0) return;

        const selectedItem = state.workspaceItems[state.selectedWorkspaceItem];
        const selectedWorkspaceName = state.workspaces[state.selectedWorkspace];

        const itemName = typeof selectedItem === 'string' ? selectedItem : selectedItem.name;
        const supportsJobActions = ParsingUtils.supportsJobActions(selectedItem);

        if (supportsJobActions) {
          actions.updateState({
            currentItem: { name: itemName, workspace: selectedWorkspaceName },
            selectedItemAction: 0,
            currentView: VIEWS.ITEM_ACTIONS
          });
        } else {
          actions.setError(`Selected item "${itemName}" does not support job actions. Only .Notebook, .Pipeline, and .SparkJobDefinition items can be run.`);
          actions.setCurrentView(VIEWS.OUTPUT);
        }
    }, [state.workspaceItems, state.selectedWorkspaceItem, state.workspaces, state.selectedWorkspace, actions]);

  const handleItemActionSelection = useCallback(async () => {
        if (!state.currentItem) return;

        const actionHandlers: Record<number, () => Promise<void> | void> = {
          0: async () => {
            actions.setCurrentView(VIEWS.OUTPUT);
            actions.setOutput('🚀 Starting job in background...');

            try {
              const job = await fabricService.startJob(
                state.currentItem!.workspace,
                state.currentItem!.name
              );

              actions.addActiveJob(job.jobId, job.workspace, job.notebook);
              actions.setOutput(
                `✅ Job started successfully in background\n\n` +
                `📍 Job ID: ${job.jobId}\n\n` +
                `💡 Use 'View Last Job Details' to check status\n\n` +
                `💡 Press 'q' or ESC to return to notebook actions menu`
              );
            } catch (error: any) {
              actions.setOutput(`❌ Failed to start job: ${error.message}\n\n💡 Press 'q' or ESC to return to notebook actions menu`);
            }
          },

          1: async () => {
            actions.setCurrentView(VIEWS.OUTPUT);
            actions.setOutput('🔄 Starting synchronous job execution...\n');

            try {
              const result = await executeCommandWithStatusUpdates(
                CommandBuilder.job.runSync(state.currentItem!.workspace, state.currentItem!.name),
                { timeout: TIMEOUTS.JOB_RUN }
              );

              if (result.success) {
                // Check the actual job status to determine if it truly succeeded
                actions.setOutput('🔍 Verifying job status...\n');
                
                try {
                  const jobId = await fabricService.getJobList(
                    state.currentItem!.workspace,
                    state.currentItem!.name
                  );
                  
                  if (jobId) {
                    const statusInfo = await fabricService.getJobStatus(
                      state.currentItem!.workspace,
                      state.currentItem!.name,
                      jobId
                    );
                    
                    actions.markJobCompleted(state.currentItem!.workspace, state.currentItem!.name);
                    
                    // Calculate actual job duration from start/end times if available
                    let actualDuration = result.duration;
                    if (statusInfo.startTime && statusInfo.endTime) {
                      const startTime = new Date(statusInfo.startTime).getTime();
                      const endTime = new Date(statusInfo.endTime).getTime();
                      actualDuration = Math.round((endTime - startTime) / 1000);
                    }
                    
                    // Build the complete message first to avoid multiple output updates
                    let finalMessage: string;
                    if (statusInfo.status === 'Completed' || statusInfo.status === 'Succeeded') {
                      finalMessage = 
                        `✅ Job completed successfully (${actualDuration}s)\n\n` +
                        `📋 Status: ${statusInfo.status}\n` +
                        `🚀 Start Time: ${ParsingUtils.formatDateTime(statusInfo.startTime)}\n` +
                        `🏁 End Time: ${ParsingUtils.formatDateTime(statusInfo.endTime)}\n\n` +
                        `💡 Press 'q' or ESC to return to actions menu`;
                    } else if (statusInfo.status === 'Failed') {
                      finalMessage = 
                        `❌ Job failed (${actualDuration}s)\n\n` +
                        `📋 Status: ${statusInfo.status}\n` +
                        `🚀 Start Time: ${ParsingUtils.formatDateTime(statusInfo.startTime)}\n` +
                        `🏁 End Time: ${statusInfo.endTime ? ParsingUtils.formatDateTime(statusInfo.endTime) : 'N/A'}\n\n` +
                        `💡 Press 'q' or ESC to return to actions menu`;
                    } else {
                      finalMessage = 
                        `⚠️ Job execution completed but final status is unclear\n\n` +
                        `📋 Status: ${statusInfo.status}\n` +
                        `🚀 Start Time: ${ParsingUtils.formatDateTime(statusInfo.startTime)}\n` +
                        `🏁 End Time: ${statusInfo.endTime ? ParsingUtils.formatDateTime(statusInfo.endTime) : 'Still running...'}\n\n` +
                        `💡 Use 'View Last Job Details' to check the actual status\n\n` +
                        `💡 Press 'q' or ESC to return to actions menu`;
                    }
                    
                    // Add a tiny delay to ensure smooth transition from verification message
                    setTimeout(() => {
                      actions.setOutput(finalMessage);
                    }, 100);
                  } else {
                    actions.markJobCompleted(state.currentItem!.workspace, state.currentItem!.name);
                    actions.setOutput(
                      `⚠️ Job execution completed (${result.duration}s) but status could not be verified\n\n` +
                      `💡 Use 'View Last Job Details' to check the actual status\n\n` +
                      `💡 Press 'q' or ESC to return to actions menu`
                    );
                  }
                } catch (statusError: any) {
                  actions.markJobCompleted(state.currentItem!.workspace, state.currentItem!.name);
                  actions.setOutput(
                    `⚠️ Job execution completed (${result.duration}s) but status check failed: ${statusError.message}\n\n` +
                    `💡 Use 'View Last Job Details' to check the actual status\n\n` +
                    `💡 Press 'q' or ESC to return to actions menu`
                  );
                }
              }
            } catch (error: any) {
              actions.markJobCompleted(state.currentItem!.workspace, state.currentItem!.name);
              actions.setOutput(`❌ Job failed: ${error.message}\n\n💡 Press 'q' or ESC to return to item actions menu`);
            }
          },

          2: async () => {
            actions.setCurrentView(VIEWS.OUTPUT);
            actions.setOutput('🔍 Getting job details...');

            try {
              const jobId = await fabricService.getJobList(
                state.currentItem!.workspace,
                state.currentItem!.name
              );

              if (jobId) {
                const statusInfo = await fabricService.getJobStatus(
                  state.currentItem!.workspace,
                  state.currentItem!.name,
                  jobId
                );

                actions.setOutput(
                  `📊 Last Job Details:\n\n` +
                  `🔖 Job ID: ${jobId}\n` +
                  `📋 Status: ${statusInfo.status}\n` +
                  `🚀 Start Time: ${ParsingUtils.formatDateTime(statusInfo.startTime)}\n` +
                  `🏁 End Time: ${statusInfo.endTime ? ParsingUtils.formatDateTime(statusInfo.endTime) : 'Still running...'}\n\n` +
                  `💡 Press 'q' or ESC to return to item actions menu`
                );
              } else {
                actions.setOutput(`ℹ️ No job history found for this item\n\n💡 Press 'q' or ESC to return to item actions menu`);
              }
            } catch (error: any) {
              actions.setOutput(`❌ Failed to get job details: ${error.message}\n\n💡 Press 'q' or ESC to return to item actions menu`);
            }
          },

          3: async () => {
            // Move Item to Another Workspace action
            actions.updateState({
              currentView: VIEWS.WORKSPACE_SELECTION,
              selectedDestinationWorkspace: 0,
              isMovingItem: true
            });
            
            try {
              const workspaceList = await fabricService.listWorkspaces();
              actions.setWorkspaces(workspaceList);
            } catch (error: any) {
              actions.setError(error.message);
              actions.setCurrentView(VIEWS.OUTPUT);
            }
          },

          4: async () => {
            // Copy Item to Another Workspace action
            actions.updateState({
              currentView: VIEWS.WORKSPACE_SELECTION,
              selectedDestinationWorkspace: 0,
              isMovingItem: false
            });
            
            try {
              const workspaceList = await fabricService.listWorkspaces();
              actions.setWorkspaces(workspaceList);
            } catch (error: any) {
              actions.setError(error.message);
              actions.setCurrentView(VIEWS.OUTPUT);
            }
          },

          5: () => {
            actions.updateState({
              currentView: VIEWS.WORKSPACE_ITEMS,
              selectedItemAction: 0,
              currentItem: null
            });
          }
        };

        const handler = actionHandlers[state.selectedItemAction];
        if (handler) await handler();
      }, [state.currentItem, state.selectedItemAction, actions, fabricService, executeCommandWithStatusUpdates]);

  const checkJobStatus = useCallback(async () => {
      if (!state.currentJob) return;

      try {
        const statusInfo = await fabricService.getJobStatus(
          state.currentJob.workspace,
          state.currentJob.notebook,
          state.currentJob.jobId
        );

        if (['Completed', 'Succeeded', 'Failed'].includes(statusInfo.status)) {
          actions.markJobCompleted(state.currentJob.workspace, state.currentJob.notebook);
        }
      } catch (error: any) {
        actions.setError(error.message);
      }
  }, [state.currentJob, fabricService, actions]);

  const handleDestinationWorkspaceSelection = useCallback(async () => {
    if (!state.currentItem || state.workspaces.length === 0) return;

    // Filter out the current workspace
    const availableWorkspaces = state.workspaces.filter(ws => ws !== state.currentItem?.workspace);
    
    if (state.selectedDestinationWorkspace >= availableWorkspaces.length) {
      // Return to Item Actions selected
      actions.updateState({
        currentView: VIEWS.ITEM_ACTIONS,
        selectedDestinationWorkspace: 0
      });
      return;
    }

    const destinationWorkspace = availableWorkspaces[state.selectedDestinationWorkspace];
    const operation = state.isMovingItem ? 'move' : 'copy';
    const operationVerb = state.isMovingItem ? 'Moving' : 'Copying';
    const operationPastTense = state.isMovingItem ? 'moved' : 'copied';
    
    actions.setCurrentView(VIEWS.OUTPUT);
    actions.setOutput(`🚀 ${operationVerb} ${state.currentItem.name} to ${destinationWorkspace}...`);

    try {
      // Use silent execution to prevent error flickering in UI
      if (state.isMovingItem) {
        await fabricService.moveItem(
          state.currentItem.workspace,
          destinationWorkspace,
          state.currentItem.name
        );
      } else {
        await fabricService.copyItem(
          state.currentItem.workspace,
          destinationWorkspace,
          state.currentItem.name
        );
      }

      actions.setOutput(
        `✅ Successfully ${operationPastTense} ${state.currentItem.name}\n\n` +
        `📂 From: ${state.currentItem.workspace}\n` +
        `📂 To: ${destinationWorkspace}\n\n` +
        `💡 Press 'q' or ESC to return to workspace items`
      );

      // Update state based on operation type
      if (state.isMovingItem) {
        // Clear current item for move (since it's no longer in the current workspace)
        actions.setCurrentItem(null);
      }

    } catch (error: any) {
      const errorMessage = error.message || '';
      
      if (errorMessage.includes('ItemDisplayNameNotAvailableYet') || 
          errorMessage.includes('not available yet') ||
          errorMessage.includes('is expected to become available')) {
        actions.setError(''); // Clear any lingering error state
        actions.setOutput(
          `⏳ Item ${operation} failed: Item is not available yet\n\n` +
          `The item was recently ${operationPastTense} and has a cooldown period before it can be ${operationPastTense} again. This is a Fabric platform limitation.\n\n` +
          `⏰ Please wait a few minutes and try again.\n\n` +
          `💡 Press 'q' or ESC to return to item actions menu`
        );
      } else {
        actions.setError(''); // Clear any lingering error state
        actions.setOutput(
          `❌ Failed to ${operation} item: ${errorMessage}\n\n` +
          `💡 Press 'q' or ESC to return to item actions menu`
        );
      }
    }
  }, [state.currentItem, state.workspaces, state.selectedDestinationWorkspace, state.isMovingItem, actions, fabricService]);

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
              // Check the actual job status to determine if it truly succeeded
              actions.setOutput('🔍 Verifying job status...\n');
              
              try {
                const jobId = await fabricService.getJobList(
                  state.currentJob!.workspace,
                  state.currentJob!.notebook
                );
                
                if (jobId) {
                  const statusInfo = await fabricService.getJobStatus(
                    state.currentJob!.workspace,
                    state.currentJob!.notebook,
                    jobId
                  );
                  
                  // Calculate actual job duration from start/end times if available
                  let actualDuration = result.duration;
                  if (statusInfo.startTime && statusInfo.endTime) {
                    const startTime = new Date(statusInfo.startTime).getTime();
                    const endTime = new Date(statusInfo.endTime).getTime();
                    actualDuration = Math.round((endTime - startTime) / 1000);
                  }
                  
                  if (statusInfo.status === 'Completed' || statusInfo.status === 'Succeeded') {
                    actions.setOutput(
                      `✅ Job completed successfully (${actualDuration}s)\n\n` +
                      `📋 Status: ${statusInfo.status}\n` +
                      `🚀 Start Time: ${ParsingUtils.formatDateTime(statusInfo.startTime)}\n` +
                      `🏁 End Time: ${ParsingUtils.formatDateTime(statusInfo.endTime)}\n\n` +
                      `💡 Press 'q' or ESC to return to main menu`
                    );
                  } else if (statusInfo.status === 'Failed') {
                    actions.setOutput(
                      `❌ Job failed (${actualDuration}s)\n\n` +
                      `📋 Status: ${statusInfo.status}\n` +
                      `🚀 Start Time: ${ParsingUtils.formatDateTime(statusInfo.startTime)}\n` +
                      `🏁 End Time: ${statusInfo.endTime ? ParsingUtils.formatDateTime(statusInfo.endTime) : 'N/A'}\n\n` +
                      `💡 Press 'q' or ESC to return to main menu`
                    );
                  } else {
                    actions.setOutput(
                      `⚠️ Job execution completed but final status is unclear\n\n` +
                      `📋 Status: ${statusInfo.status}\n` +
                      `🚀 Start Time: ${ParsingUtils.formatDateTime(statusInfo.startTime)}\n` +
                      `🏁 End Time: ${statusInfo.endTime ? ParsingUtils.formatDateTime(statusInfo.endTime) : 'Still running...'}\n\n` +
                      `💡 Use 'View Last Job Details' to check the actual status\n\n` +
                      `💡 Press 'q' or ESC to return to main menu`
                    );
                  }
                } else {
                  actions.setOutput(
                    `⚠️ Job execution completed (${result.duration}s) but status could not be verified\n\n` +
                    `💡 Use 'View Last Job Details' to check the actual status\n\n` +
                    `💡 Press 'q' or ESC to return to main menu`
                  );
                }
              } catch (statusError: any) {
                actions.setOutput(
                  `⚠️ Job execution completed (${result.duration}s) but status check failed: ${statusError.message}\n\n` +
                  `💡 Use 'View Last Job Details' to check the actual status\n\n` +
                  `💡 Press 'q' or ESC to return to main menu`
                );
              }
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
    try {
      const workspaceList = await fabricService.listWorkspaces();
      actions.setWorkspaces(workspaceList);
    } catch (error: any) {
      actions.setError(error.message);
    }
  }, [fabricService, actions]);

  // Debounced versions of handlers to prevent excessive API calls
  const debouncedWorkspaceSelection = useDebouncedAsync(handleWorkspaceSelection, 200);
  const debouncedRefreshWorkspaces = useDebouncedAsync(refreshWorkspaces, 500);

  const handlers: Handlers = useMemo(() => ({
    handleMenuSelection,
    handleWorkspaceSelection,
    handleWorkspaceItemSelection,
    handleItemActionSelection,
    handleJobMenuSelection,
    handleDestinationWorkspaceSelection,
    checkJobStatus,
    refreshWorkspaces: debouncedRefreshWorkspaces
  }), [
    handleMenuSelection,
    handleWorkspaceSelection,
    handleWorkspaceItemSelection,
    handleItemActionSelection,
    handleJobMenuSelection,
    handleDestinationWorkspaceSelection,
    checkJobStatus,
    debouncedRefreshWorkspaces
  ]);

  const inputHandlers = createInputHandlers(state, actions, handlers);
  const currentInputHandler = inputHandlers[state.currentView] || inputHandlers.default;

  useInput((input: string, key: Key) => {
    if (state.inInteractiveMode) return;
    currentInputHandler(input, key);
    if (input === 'q' && state.currentView === VIEWS.MAIN) exit();
  });

  const terminalHeight = stdout?.rows || 24;
  const terminalWidth = stdout?.columns || 80;

  if (state.inInteractiveMode) return createBox(
    { 
      flexDirection: 'column',
      width: terminalWidth,
      minHeight: Math.max(terminalHeight, 10),
      padding: 0
    }, 
    []
  );
  
  if (showLoadingScreen) return createBox(
    { 
      flexDirection: 'column',
      width: terminalWidth,
      minHeight: Math.max(terminalHeight, 10),
      padding: 0,
      justifyContent: 'center',
      alignItems: 'center'
    }, 
    [h(LoadingScreen)]
  );

  const viewComponents: Record<string, () => React.ReactElement> = {
    [VIEWS.MAIN]: () => h(MainMenu, { selectedOption: state.selectedOption }),
    [VIEWS.WORKSPACES]: () => h(WorkspacesList, {
      workspaces: state.workspaces,
      selectedWorkspace: state.selectedWorkspace,
      loading: state.loading,
      error: state.error,
      loadingProgress: state.loadingProgress,
      terminalHeight
    }),
    [VIEWS.WORKSPACE_ITEMS]: () => h(WorkspaceItems, {
      items: state.workspaceItems,
      selectedItem: state.selectedWorkspaceItem,
      workspaceName: state.workspaces[state.selectedWorkspace],
      loading: state.loading,
      error: state.error,
      loadingProgress: state.loadingProgress,
      terminalHeight
    }),
    [VIEWS.COMMAND_HISTORY]: () => h(CommandHistory, { history: state.commandHistory }),
    [VIEWS.ITEM_ACTIONS]: () => h(ItemActionsMenu, {
      itemName: state.currentItem?.name || '',
      workspace: state.currentItem?.workspace || '',
      selectedOption: state.selectedItemAction
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
    [VIEWS.WORKSPACE_SELECTION]: () => h(WorkspaceSelection, {
      workspaces: state.workspaces.filter(ws => ws !== state.currentItem?.workspace),
      selectedWorkspace: state.selectedDestinationWorkspace,
      currentItem: state.currentItem,
      loading: state.loading,
      error: state.error,
      isMovingItem: state.isMovingItem
    }),
    [VIEWS.OUTPUT]: () => h(OutputView, {
      output: state.output,
      error: state.error,
      loading: state.loading,
      title: state.currentItem ? 'Job Output' : menuOptions[state.selectedOption]?.label,
      activeJobs: state.activeJobs,
      currentItem: state.currentItem
    })
  };

  const Component = viewComponents[state.currentView] || viewComponents[VIEWS.MAIN];
  
  return createBox(
    { 
      flexDirection: 'column',
      width: terminalWidth,
      minHeight: Math.max(terminalHeight, 10), // Ensure minimum height
      padding: 0,
      overflowY: 'hidden'
    }, 
    [Component()]
  );
};
