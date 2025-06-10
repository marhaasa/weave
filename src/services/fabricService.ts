import { CommandBuilder } from '../utils/commandBuilder.js';
import { ParsingUtils } from '../utils/parsing.js';
import type { CommandResult, WorkspaceItem, JobInfo, StatusInfo, ExecuteCommandOptions } from '../types/index.js';
import { writeFileSync, appendFileSync } from 'fs';

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

export class FabricService {
  // Removed all caching
  
  constructor(
    private executeCommand: (command: string, options?: ExecuteCommandOptions) => Promise<CommandResult>
  ) { 
    // Initialize debug log only in debug mode
    if (process.env.WEAVE_DEBUG) {
      try {
        writeFileSync('/tmp/weave-debug.log', `=== Weave Debug Log Started at ${new Date().toISOString()} ===\n`);
      } catch (error) {
        // Ignore file write errors
      }
    }
  }

  // Removed all caching methods

  async listWorkspaces(forceRefresh = false): Promise<string[]> {
    const command = CommandBuilder.listWorkspaces();
    const result = await this.executeCommand(command);

    if (!result.success) {
      throw new Error(`Failed to list workspaces: ${result.error || 'Unknown error'}`);
    }

    const workspaces = ParsingUtils.parseWorkspaces(result.output);
    return workspaces;
  }

  async listWorkspaceItems(workspace: string, forceRefresh = false): Promise<WorkspaceItem[]> {
    const command = CommandBuilder.listWorkspace(workspace);
    const result = await this.executeCommand(command);

    debugLog(`Command result success: ${result.success}`);
    debugLog(`Command output length: ${result.output?.length || 0}`);

    if (!result.success) {
      debugLog(`Command failed: ${result.error}`);
      throw new Error(`Failed to list items in ${workspace}: ${result.error || 'Unknown error'}`);
    }

    const items = ParsingUtils.parseWorkspaceItems(result.output);
    debugLog(`Parsed ${items.length} items for workspace ${workspace}`);
    debugLog(`Items: ${items.map(item => item.name).join(', ')}`);
    return items;
  }

  async startJob(workspace: string, itemName: string): Promise<JobInfo> {
    const command = CommandBuilder.job.start(workspace, itemName);
    const result = await this.executeCommand(command, { silent: true });

    if (!result.success) {
      throw new Error(`Failed to start job: ${result.error || 'Unknown error'}`);
    }

    const jobId = ParsingUtils.extractJobId(result.output);
    if (!jobId) {
      throw new Error('Failed to extract job ID from output');
    }


    return {
      jobId,
      workspace,
      notebook: itemName, // Keep for compatibility
      startTime: Date.now()
    };
  }

  async runJobSync(workspace: string, itemName: string): Promise<CommandResult> {
    const command = CommandBuilder.job.runSync(workspace, itemName);
    return await this.executeCommand(command, { timeout: 600000 }); // 10 minutes
  }

  async getJobStatus(workspace: string, itemName: string, jobId: string): Promise<StatusInfo> {
    const command = CommandBuilder.job.status(workspace, itemName, jobId);
    const result = await this.executeCommand(command);

    if (!result.success) {
      throw new Error(`Failed to get job status: ${result.error || 'Unknown error'}`);
    }

    return ParsingUtils.parseJobStatus(result.output);
  }

  async getJobList(workspace: string, itemName: string): Promise<string | null> {
    const command = CommandBuilder.job.list(workspace, itemName);
    const result = await this.executeCommand(command, { silent: true });

    if (!result.success) {
      throw new Error(`Failed to get job list: ${result.error || 'Unknown error'}`);
    }

    const jobId = ParsingUtils.extractGuid(result.output);
    return jobId;
  }

  async moveItem(fromWorkspace: string, toWorkspace: string, itemName: string): Promise<CommandResult> {
    const command = CommandBuilder.moveItem(fromWorkspace, toWorkspace, itemName);
    debugLog(`Move command: ${command}`);
    const result = await this.executeCommand(command, { silent: true });
    debugLog(`Move result success: ${result.success}`);

    if (!result.success) {
      const errorInfo = result.error || result.output || 'Unknown error';
      
      // Check if this is a cooldown error and include the stderr details
      if (result.error && (
          result.error.includes('ItemDisplayNameNotAvailableYet') || 
          result.error.includes('not available yet') ||
          result.error.includes('is expected to become available')
      )) {
        throw new Error(`Failed to move item: ${result.error}`);
      } else {
        throw new Error(`Failed to move item: ${errorInfo}`);
      }
    }

    return result;
  }

  async copyItem(fromWorkspace: string, toWorkspace: string, itemName: string): Promise<CommandResult> {
    const command = CommandBuilder.copyItem(fromWorkspace, toWorkspace, itemName);
    debugLog(`Copy command: ${command}`);
    const result = await this.executeCommand(command, { silent: true });
    debugLog(`Copy result success: ${result.success}`);

    if (!result.success) {
      const errorInfo = result.error || result.output || 'Unknown error';
      
      // Check if this is a cooldown error and include the stderr details
      if (result.error && (
          result.error.includes('ItemDisplayNameNotAvailableYet') || 
          result.error.includes('not available yet') ||
          result.error.includes('is expected to become available')
      )) {
        throw new Error(`Failed to copy item: ${result.error}`);
      } else {
        throw new Error(`Failed to copy item: ${errorInfo}`);
      }
    }

    return result;
  }
}
