import { CommandBuilder } from '../utils/commandBuilder.js';
import { ParsingUtils } from '../utils/parsing.js';
import type { CommandResult, WorkspaceItem, JobInfo, StatusInfo, ExecuteCommandOptions } from '../types/index.js';

export class FabricService {
  constructor(
    private executeCommand: (command: string, options?: ExecuteCommandOptions) => Promise<CommandResult>
  ) { }

  async listWorkspaces(): Promise<string[]> {
    const command = CommandBuilder.listWorkspaces();
    const result = await this.executeCommand(command);

    if (!result.success) {
      throw new Error(`Failed to list workspaces: ${result.error || 'Unknown error'}`);
    }

    return ParsingUtils.parseWorkspaces(result.output);
  }

  async listWorkspaceItems(workspace: string): Promise<WorkspaceItem[]> {
    const command = CommandBuilder.listWorkspace(workspace);
    const result = await this.executeCommand(command);

    if (!result.success) {
      throw new Error(`Failed to list items in ${workspace}: ${result.error || 'Unknown error'}`);
    }

    return ParsingUtils.parseWorkspaceItems(result.output);
  }

  async startJob(workspace: string, notebook: string): Promise<JobInfo> {
    const command = CommandBuilder.job.start(workspace, notebook);
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
      notebook,
      startTime: Date.now()
    };
  }

  async runJobSync(workspace: string, notebook: string): Promise<CommandResult> {
    const command = CommandBuilder.job.runSync(workspace, notebook);
    return await this.executeCommand(command, { timeout: 600000 }); // 10 minutes
  }

  async getJobStatus(workspace: string, notebook: string, jobId: string): Promise<StatusInfo> {
    const command = CommandBuilder.job.status(workspace, notebook, jobId);
    const result = await this.executeCommand(command, { skipCache: true });

    if (!result.success) {
      throw new Error(`Failed to get job status: ${result.error || 'Unknown error'}`);
    }

    return ParsingUtils.parseJobStatus(result.output);
  }

  async getJobList(workspace: string, notebook: string): Promise<string | null> {
    const command = CommandBuilder.job.list(workspace, notebook);
    const result = await this.executeCommand(command, { skipCache: true, silent: true });

    if (!result.success) {
      throw new Error(`Failed to get job list: ${result.error || 'Unknown error'}`);
    }

    return ParsingUtils.extractGuid(result.output);
  }
}
