export const CommandBuilder = {
  listWorkspaces: (): string => 'fab ls',
  help: (): string => 'fab --help',
  listWorkspace: (workspace: string): string => `fab ls "${workspace}.Workspace"`,

  job: {
    start: (workspace: string, notebook: string): string =>
      `fab job start ${workspace}.Workspace/${notebook}`,
    runSync: (workspace: string, notebook: string): string =>
      `fab job run /${workspace}.Workspace/${notebook}`,
    status: (workspace: string, notebook: string, jobId: string): string =>
      `fab job run-status /${workspace}.Workspace/${notebook} --id ${jobId}`,
    list: (workspace: string, notebook: string): string =>
      `fab job run-list /${workspace}.Workspace/${notebook}`
  }
};