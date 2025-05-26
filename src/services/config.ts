import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type { Config } from '../types/index.js';
import { LIMITS } from '../constants/index.js';

export const CONFIG_DIR = path.join(os.homedir(), '.weave');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export const loadConfig = async (): Promise<Config> => {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return { cacheTimeout: LIMITS.CACHE_TIMEOUT, maxRetries: LIMITS.MAX_RETRIES, theme: 'default' };
  }
};

export const saveConfig = async (config: Config): Promise<void> => {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
};