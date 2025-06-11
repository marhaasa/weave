import type { Key } from 'ink';
import type { State, Actions, Handlers, InputHandler } from '../types/index.js';
import { VIEWS } from '../constants/index.js';
import { handleNavigation } from '../utils/navigation.js';
import { HistoryManager } from '../services/history.js';
import { appendFileSync } from 'fs';

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

export const createInputHandlers = (
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

    // +1 for import option and return option (both at the end)
    const maxSelection = state.workspaceItems.length + 1;
    handleNavigation(key, state.selectedWorkspaceItem, maxSelection, actions.setSelectedWorkspaceItem);

    if (key.return) {
      handlers.handleWorkspaceItemSelection();
    }
  },

  [VIEWS.ITEM_ACTIONS]: (input: string, key: Key) => {
    handleNavigation(key, state.selectedItemAction, 6, actions.setSelectedItemAction);

    if (key.return) handlers.handleItemActionSelection();
    else if (key.escape || input === 'q') {
      actions.updateState({
        currentView: VIEWS.WORKSPACE_ITEMS,
        selectedItemAction: 0,
        currentItem: null
        // Keep selectedWorkspaceItem unchanged to preserve cursor position
      });
      // Don't call handleWorkspaceSelection as it resets cursor position
      // Only refresh if a move operation actually happened (which clears currentItem)
    }
  },

  [VIEWS.WORKSPACE_SELECTION]: (input: string, key: Key) => {
    if (!state.currentItem) return;
    
    // Filter out the current workspace to get available destinations
    const availableWorkspaces = state.workspaces.filter(ws => ws !== state.currentItem?.workspace);
    const maxSelection = availableWorkspaces.length; // Includes "Return to Item Actions" option
    
    handleNavigation(key, state.selectedDestinationWorkspace, maxSelection, actions.setSelectedDestinationWorkspace);

    if (key.return) {
      handlers.handleDestinationWorkspaceSelection();
    } else if (key.escape || input === 'q') {
      actions.updateState({
        currentView: VIEWS.ITEM_ACTIONS,
        selectedDestinationWorkspace: 0
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
      if (state.currentItem) {
        actions.setCurrentView(VIEWS.ITEM_ACTIONS);
      } else if (state.workspaces.length > 0 && state.selectedWorkspace < state.workspaces.length) {
        // Simple: just go back to workspace items
        actions.setCurrentView(VIEWS.WORKSPACE_ITEMS);
        handlers.handleWorkspaceSelection();
      } else {
        actions.setCurrentView(VIEWS.MAIN);
        actions.resetState();
      }
    }
  },

  [VIEWS.EXPORT_PATH_INPUT]: (input: string, key: Key) => {
    handleNavigation(key, state.selectedPathOption, 3, actions.setSelectedPathOption);

    if (key.return) handlers.handleExportPathSelection();
    else if (key.escape || input === 'q') {
      actions.setCurrentView(VIEWS.ITEM_ACTIONS);
    }
  },

  [VIEWS.IMPORT_PATH_INPUT]: (input: string, key: Key) => {
    handleNavigation(key, state.selectedPathOption, 3, actions.setSelectedPathOption);

    if (key.return) handlers.handleImportPathSelection();
    else if (key.escape || input === 'q') {
      actions.setCurrentView(VIEWS.WORKSPACE_ITEMS);
    }
  },

  [VIEWS.TEXT_INPUT]: (input: string, key: Key) => {
    if (key.return) {
      // Submit the current text input value
      const currentValue = state.textInputValue;
      
      switch (state.textInputContext) {
        case 'export':
          actions.setExportPath(currentValue || '/tmp');
          actions.setCurrentView(VIEWS.EXPORT_PATH_INPUT);
          break;
        case 'import':
          actions.setImportPath(currentValue || '/tmp');
          actions.setCurrentView(VIEWS.IMPORT_PATH_INPUT);
          break;
        case 'importName':
          let itemName = currentValue || 'UnnamedItem';
          // Auto-append .Notebook if no extension is provided
          if (!itemName.includes('.')) {
            itemName += '.Notebook';
          }
          actions.setImportItemName(itemName);
          
          // Set a trigger flag for the app to detect and execute import
          actions.updateState({
            currentView: VIEWS.OUTPUT,
            output: `📥 Importing ${itemName} from ${state.importPath}...`,
            selectedPathOption: 777 // Trigger flag for useEffect in app
          });
          break;
        default:
          // Fallback
          actions.setCurrentView(VIEWS.IMPORT_PATH_INPUT);
      }
    } else if (key.escape) {
      // Cancel text input
      switch (state.textInputContext) {
        case 'export':
          actions.setCurrentView(VIEWS.EXPORT_PATH_INPUT);
          break;
        case 'import':
          actions.setCurrentView(VIEWS.IMPORT_PATH_INPUT);
          break;
        case 'importName':
          actions.setCurrentView(VIEWS.IMPORT_PATH_INPUT);
          break;
        default:
          actions.setCurrentView(VIEWS.IMPORT_PATH_INPUT);
      }
    } else if (key.backspace || key.delete) {
      // Remove last character
      actions.setTextInputValue(state.textInputValue.slice(0, -1));
    } else if (!key.ctrl && !key.meta && input.length === 1) {
      // Add character
      actions.setTextInputValue(state.textInputValue + input);
    }
  },

  default: (input: string, key: Key) => {
    if (key.escape || input === 'q') {
      actions.setCurrentView(VIEWS.MAIN);
      actions.resetState();
    }
  }
});