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

  [VIEWS.ITEM_ACTIONS]: (input: string, key: Key) => {
    handleNavigation(key, state.selectedItemAction, 5, actions.setSelectedItemAction);

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

  default: (input: string, key: Key) => {
    if (key.escape || input === 'q') {
      actions.setCurrentView(VIEWS.MAIN);
      actions.resetState();
    }
  }
});