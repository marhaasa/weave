import fs from 'fs/promises';
import path from 'path';
import type { HistoryEntry, CommandResult } from '../types/index.js';
import { CONFIG_DIR } from './config.js';
import { LIMITS } from '../constants/index.js';

export const HISTORY_FILE = path.join(CONFIG_DIR, 'history.json');

export const HistoryManager = {
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