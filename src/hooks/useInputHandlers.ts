import type { Key } from 'ink';
import type { State, Actions, Handlers, InputHandler } from '../types/index.js';
import { VIEWS } from '../constants/index.js';
import { handleNavigation } from '../utils/navigation.js';
import { HistoryManager } from '../services/history.js';

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