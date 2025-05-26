import React, { ReactElement } from 'react';
import { createBox, createText, createMenuItem, createLoadingDisplay, createErrorDisplay, spacer } from '../utils/uiHelpers.js';
import { COLORS } from '../constants/index.js';

interface WorkspacesListProps {
  workspaces: string[];
  selectedWorkspace: number;
  loading: boolean;
  error: string;
  loadingProgress: number;
}

export const WorkspacesList: React.FC<WorkspacesListProps> = React.memo(({
  workspaces,
  selectedWorkspace,
  loading,
  error,
  loadingProgress
}) => {
  const elements: ReactElement[] = [
    createText({ key: 'title', bold: true, color: COLORS.PRIMARY }, 'Workspaces'),
    spacer()
  ];

  if (loading) {
    elements.push(createLoadingDisplay('Loading workspaces...', 'workspaces'));
  } else if (error) {
    elements.push(...createErrorDisplay(error, 'workspaces'));
    elements.push(
      createText({ key: 'retry-tip', color: COLORS.SECONDARY, italic: true },
        'Press Enter to retry or check your network connection'
      )
    );
  } else if (workspaces.length > 0) {
    elements.push(
      createText({ key: 'workspace-title', color: COLORS.SUCCESS, bold: true },
        `Found ${workspaces.length} workspace${workspaces.length === 1 ? '' : 's'}:`
      ),
      spacer('spacer2'),
      ...workspaces.map((workspace, index) =>
        createMenuItem(workspace, index, selectedWorkspace, COLORS.SUCCESS_BG)
      ),
      spacer('separator'),
      createMenuItem('Return to Main Menu', workspaces.length, selectedWorkspace, COLORS.SECONDARY)
    );
  } else if (!loading) {
    elements.push(
      createText({ key: 'no-workspaces', color: COLORS.WARNING }, '⚠️  No workspaces found'),
      createText({ key: 'refresh-tip', color: COLORS.SECONDARY, italic: true },
        'Press Enter to retry or check your fabric CLI setup'
      )
    );
  }

  return createBox({ flexDirection: 'column', padding: 1 }, elements);
});