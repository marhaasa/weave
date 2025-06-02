import React, { ReactElement } from 'react';
import { createFullWidthBox, createText, createMenuItem, createLoadingDisplay, createErrorDisplay, createPaginatedList, spacer } from '../utils/uiHelpers.js';
import { COLORS } from '../constants/index.js';

interface WorkspacesListProps {
  workspaces: string[];
  selectedWorkspace: number;
  loading: boolean;
  error: string;
  loadingProgress: number;
  terminalHeight?: number;
}

export const WorkspacesList: React.FC<WorkspacesListProps> = React.memo(({
  workspaces,
  selectedWorkspace,
  loading,
  error,
  loadingProgress,
  terminalHeight = 24
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
    // Calculate available space for list items
    // Reserve space for: title (1) + spacer (1) + found text (1) + spacer (1) + separator (1) + return menu (1) + padding (2) = 8 lines
    const reservedLines = 8;
    const availableLines = Math.max(3, terminalHeight - reservedLines);
    const maxVisibleItems = Math.min(availableLines, workspaces.length);
    
    elements.push(
      createText({ key: 'workspace-title', color: COLORS.SUCCESS, bold: true },
        `Found ${workspaces.length} workspace${workspaces.length === 1 ? '' : 's'}:`
      ),
      spacer('spacer2')
    );
    
    // Add paginated workspace items
    // If "Return to Main Menu" is selected, show the last items in the list
    const effectiveSelectedIndex = selectedWorkspace >= workspaces.length 
      ? workspaces.length - 1 
      : selectedWorkspace;
      
    const paginatedWorkspaces = createPaginatedList(
      workspaces,
      effectiveSelectedIndex,
      (workspace, index, isSelected) => 
        createMenuItem(workspace, index, selectedWorkspace === index ? index : -1, COLORS.SUCCESS_BG),
      maxVisibleItems
    );
    
    elements.push(...paginatedWorkspaces);
    
    elements.push(
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

  return createFullWidthBox({ 
    padding: 1, 
    alignItems: 'flex-start',
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    overflowY: 'hidden'
  }, elements);
});