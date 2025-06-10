export const CommandBuilder = {
  listWorkspaces: (): string => 'fab ls',
  help: (): string => 'fab --help',
  listWorkspace: (workspace: string): string => `fab ls "${workspace}.Workspace"`,
  moveItem: (fromWorkspace: string, toWorkspace: string, itemName: string): string =>
    `fab mv -f "/${fromWorkspace}.Workspace/${itemName}" "/${toWorkspace}.Workspace/${itemName}"`,
  copyItem: (fromWorkspace: string, toWorkspace: string, itemName: string): string =>
    `fab cp -f "/${fromWorkspace}.Workspace/${itemName}" "/${toWorkspace}.Workspace/${itemName}"`,

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