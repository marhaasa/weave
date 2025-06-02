export const CommandBuilder = {
  listWorkspaces: (): string => 'fab ls',
  help: (): string => 'fab --help',
  listWorkspace: (workspace: string): string => `fab ls "${workspace}.Workspace"`,

  job: {
    start: (workspace: string, itemName: string): string =>
      `fab job start ${workspace}.Workspace/${itemName}`,
    runSync: (workspace: string, itemName: string): string =>
      `fab job run /${workspace}.Workspace/${itemName}`,
    status: (workspace: string, itemName: string, jobId: string): string =>
      `fab job run-status /${workspace}.Workspace/${itemName} --id ${jobId}`,
    list: (workspace: string, itemName: string): string =>
      `fab job run-list /${workspace}.Workspace/${itemName}`
  }
};