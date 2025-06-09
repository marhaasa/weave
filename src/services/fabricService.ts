import { CommandBuilder } from '../utils/commandBuilder.js';
import { ParsingUtils } from '../utils/parsing.js';
import type { CommandResult, WorkspaceItem, JobInfo, StatusInfo, ExecuteCommandOptions } from '../types/index.js';

export class FabricService {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  
  constructor(
    private executeCommand: (command: string, options?: ExecuteCommandOptions) => Promise<CommandResult>
  ) { }

  private getCacheKey(type: 'workspaces' | 'workspace-items' | 'job-status' | 'job-list', ...params: string[]): string {
    return `${type}:${params.join(':')}`;
  }

  private getCachedData<T>(key: string): T | null {
    // Disable caching - always return null to force fresh fetches
    return null;
  }

  private setCachedData<T>(key: string, data: T): void {
    // Disable caching - don't store anything
    // this.cache.set(key, { data, timestamp: Date.now() });
  }

  public invalidateCache(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  async listWorkspaces(forceRefresh = false): Promise<string[]> {
    const cacheKey = this.getCacheKey('workspaces');
    
    if (!forceRefresh) {
      const cached = this.getCachedData<string[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const command = CommandBuilder.listWorkspaces();
    const result = await this.executeCommand(command);

    if (!result.success) {
      throw new Error(`Failed to list workspaces: ${result.error || 'Unknown error'}`);
    }

    const workspaces = ParsingUtils.parseWorkspaces(result.output);
    this.setCachedData(cacheKey, workspaces);
    return workspaces;
  }

  async listWorkspaceItems(workspace: string, forceRefresh = false): Promise<WorkspaceItem[]> {
    const cacheKey = this.getCacheKey('workspace-items', workspace);
    
    if (!forceRefresh) {
      const cached = this.getCachedData<WorkspaceItem[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const command = CommandBuilder.listWorkspace(workspace);
    const result = await this.executeCommand(command);

    if (!result.success) {
      throw new Error(`Failed to list items in ${workspace}: ${result.error || 'Unknown error'}`);
    }

    const items = ParsingUtils.parseWorkspaceItems(result.output);
    this.setCachedData(cacheKey, items);
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

    // Invalidate job-related cache since we're starting a new job
    this.invalidateCache(`job-list:${workspace}:${itemName}`);
    this.invalidateCache(`job-status:${workspace}:${itemName}`);

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
    const result = await this.executeCommand(command, { skipCache: true });

    if (!result.success) {
      throw new Error(`Failed to get job status: ${result.error || 'Unknown error'}`);
    }

    return ParsingUtils.parseJobStatus(result.output);
  }

  async getJobList(workspace: string, itemName: string, useCache = true): Promise<string | null> {
    const cacheKey = this.getCacheKey('job-list', workspace, itemName);
    
    if (useCache) {
      const cached = this.getCachedData<string | null>(cacheKey);
      if (cached !== null) {
        return cached;
      }
    }

    const command = CommandBuilder.job.list(workspace, itemName);
    const result = await this.executeCommand(command, { skipCache: true, silent: true });

    if (!result.success) {
      throw new Error(`Failed to get job list: ${result.error || 'Unknown error'}`);
    }

    const jobId = ParsingUtils.extractGuid(result.output);
    this.setCachedData(cacheKey, jobId);
    return jobId;
  }

  async moveItem(fromWorkspace: string, toWorkspace: string, itemName: string): Promise<CommandResult> {
    const command = CommandBuilder.moveItem(fromWorkspace, toWorkspace, itemName);
    const result = await this.executeCommand(command, { silent: true });

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
}
