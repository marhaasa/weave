import { useMemo } from 'react';
import { FabricService } from '../services/fabricService.js';
import type { ExecuteCommandOptions, CommandResult } from '../types/index.js';

export const useFabricService = (
  executeCommand: (command: string, options?: ExecuteCommandOptions) => Promise<CommandResult>
) => {
  return useMemo(() => {
    return new FabricService(executeCommand);
  }, [executeCommand]);
};
