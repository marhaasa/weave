import { useCallback } from 'react';
import { exec, spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { promisify } from 'util';
import type { Actions, Config, CommandResult, ExecuteCommandOptions } from '../types/index.js';
import { TIMEOUTS, LIMITS } from '../constants/index.js';
import { ParsingUtils } from '../utils/parsing.js';

const execAsync = promisify(exec);

export const useCommandExecution = (actions: Actions, config: Config | null) => {
  const executeCommand = useCallback(async (
    command: string,
    options: ExecuteCommandOptions = {}
  ): Promise<CommandResult> => {
    const cacheKey = `${command}-${JSON.stringify(options)}`;

    if (!options.skipCache) {
      const cachedResult = actions.getCachedData<CommandResult>(cacheKey);
      if (cachedResult) {
        if (!options.silent) {
          actions.setOutput(cachedResult.output);
          if (cachedResult.error) {
            actions.setError(cachedResult.error);
          }
        }
        return cachedResult;
      }
    }

    actions.setLoading(true);
    actions.setError('');

    const progressInterval = setInterval(() => {
      actions.setLoadingProgress((prev: number) => Math.min(prev + LIMITS.PROGRESS_INCREMENT, LIMITS.PROGRESS_MAX));
    }, TIMEOUTS.PROGRESS_UPDATE);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout || TIMEOUTS.DEFAULT);

      const { stdout, stderr } = await execAsync(command, {
        env: { ...process.env, FORCE_COLOR: '0', ...options.env },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const result: CommandResult = {
        success: !stderr?.trim(),
        output: ParsingUtils.cleanOutput(stdout),
        error: stderr?.trim(),
        command
      };

      if (result.success && !options.skipCache) {
        actions.setCachedData(cacheKey, result);
      }

      if (!options.silent) {
        if (result.success) {
          actions.setOutput(result.output);
        } else {
          actions.setError(result.error || '');
        }
      }

      actions.setLoadingProgress(100);
      await actions.addToHistory(command, result);

      return result;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        const error = 'Command timed out. Try again or check your connection.';
        const result: CommandResult = { success: false, error, command, output: '' };
        if (!options.silent) {
          actions.setError(error);
        }
        actions.setLoadingProgress(100);
        await actions.addToHistory(command, result);
        return result;
      }

      // For command execution errors, try to extract stderr from the exception
      const stderr = err.stderr || err.stdout || '';
      const error = stderr.trim() || `Error executing command: ${err.message}`;

      const result: CommandResult = { 
        success: false, 
        error, 
        command, 
        output: err.stdout || '' 
      };
      
      if (!options.silent) {
        actions.setError(error);
      }
      actions.setLoadingProgress(100);
      await actions.addToHistory(command, result);

      return result;
    } finally {
      clearInterval(progressInterval);
      actions.setLoading(false);
      setTimeout(() => actions.setLoadingProgress(0), TIMEOUTS.RETRY_DELAY);
    }
  }, [actions]);

  const executeCommandWithRetry = useCallback(async (
    command: string,
    options: ExecuteCommandOptions = {},
    maxRetries: number | null = null
  ): Promise<CommandResult> => {
    const retries = maxRetries ?? config?.maxRetries ?? LIMITS.MAX_RETRIES;
    let lastError: string = '';

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await executeCommand(command, {
          ...options,
          skipCache: attempt > 0
        });

        if (result.success) return result;
        lastError = result.error || '';

        if (attempt < retries) {
          actions.setError(`Attempt ${attempt + 1} failed. Retrying...`);
          await new Promise(resolve => setTimeout(resolve, TIMEOUTS.RETRY_DELAY * (attempt + 1)));
        }
      } catch (err: any) {
        lastError = err.message;
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, TIMEOUTS.RETRY_DELAY * (attempt + 1)));
        }
      }
    }

    actions.setError(`Command failed after ${retries + 1} attempts: ${lastError}`);
    return { success: false, error: lastError, command, output: '' };
  }, [executeCommand, actions, config]);

  const executeCommandWithStatusUpdates = useCallback(async (
    command: string,
    options: ExecuteCommandOptions = {}
  ): Promise<CommandResult> => {
    actions.setLoading(true);
    actions.setError('');

    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const child: ChildProcessWithoutNullStreams = spawn('sh', ['-c', command], {
        env: { ...process.env, FORCE_COLOR: '0', ...options.env }
      });

      let output = '';
      let error = '';
      let statusCount = 0;

      const statusInterval = setInterval(() => {
        statusCount++;
        const dots = '.'.repeat((statusCount % 3) + 1);
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        actions.setOutput(`🔄 Job is running${dots} (${elapsed}s elapsed)`);
      }, 1000);

      child.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString();
        output += chunk;

        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.includes('Completed') || line.includes('Failed')) {
            const cleanLine = line.trim();
            if (cleanLine) {
              const elapsed = Math.floor((Date.now() - startTime) / 1000);
              // Don't set output here - let the calling function handle the final message
              // actions.setOutput(`✅ Job completed (${elapsed}s)`);
            }
          }
        }
      });

      child.stderr.on('data', (data: Buffer) => {
        error += data.toString();
      });

      child.on('close', async (code: number | null) => {
        clearInterval(statusInterval);
        actions.setLoading(false);

        const duration = Math.floor((Date.now() - startTime) / 1000);
        const result: CommandResult = {
          success: code === 0 && !error.trim(),
          output: ParsingUtils.cleanOutput(output),
          error: error.trim(),
          command,
          duration
        };

        await actions.addToHistory(command, result);

        if (code === 0) {
          // Don't automatically set output here - let the calling function handle it
          resolve(result);
        } else {
          reject(new Error(error || `Command exited with code ${code}`));
        }
      });

      child.on('error', (err: Error) => {
        clearInterval(statusInterval);
        actions.setLoading(false);
        actions.setError(`Error executing command: ${err.message}`);
        reject(err);
      });

      if (options.timeout) {
        setTimeout(() => {
          clearInterval(statusInterval);
          child.kill();
          actions.setLoading(false);
          actions.setError('Command timed out');
          reject(new Error('Command timed out'));
        }, options.timeout);
      }
    });
  }, [actions]);

  return { executeCommand, executeCommandWithRetry, executeCommandWithStatusUpdates };
};