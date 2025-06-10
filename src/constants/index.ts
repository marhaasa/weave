import type { StatusConfig } from '../types/index.js';

export const VIEWS = {
  MAIN: 'main',
  WORKSPACES: 'workspaces',
  WORKSPACE_ITEMS: 'workspace-items',
  ITEM_ACTIONS: 'item-actions',
  OUTPUT: 'output',
  COMMAND_HISTORY: 'command-history',
  JOB_MENU: 'job-menu',
  JOB_STATUS: 'job-status',
  WORKSPACE_SELECTION: 'workspace-selection'
} as const;

export const COLORS = {
  PRIMARY: 'cyan',
  SUCCESS: 'green',
  WARNING: 'yellow',
  ERROR: 'red',
  SECONDARY: 'gray',
  HIGHLIGHT_BG: 'cyan',
  SUCCESS_BG: 'green',
  WARNING_BG: 'yellow'
} as const;

export const TIMEOUTS = {
  DEFAULT: 30000,
  WORKSPACE_LOAD: 15000,
  JOB_RUN: 600000,
  ANIMATION: 500,
  PROGRESS_UPDATE: 200,
  RETRY_DELAY: 1000,
  LOADING_SCREEN: 1500
} as const;

export const LIMITS = {
  MAX_RETRIES: 2,
  PROGRESS_INCREMENT: 10,
  PROGRESS_MAX: 90,
  HISTORY_SIZE: 50,
  HISTORY_DISPLAY: 10,
  OUTPUT_PREVIEW: 200
} as const;

export const STATUS_CONFIG: Record<string, StatusConfig> = {
  'Completed': { color: COLORS.SUCCESS, icon: '✅' },
  'Succeeded': { color: COLORS.SUCCESS, icon: '✅' },
  'Failed': { color: COLORS.ERROR, icon: '❌' },
  'InProgress': { color: COLORS.WARNING, icon: '🔄' },
  'NotStarted': { color: COLORS.WARNING, icon: '⏳' },
  'Unknown': { color: COLORS.WARNING, icon: '⏳' }
};