import React, { ReactElement } from 'react';
import { createFullWidthBox, createText, createMenuItem, createLoadingDisplay, createErrorDisplay, createPaginatedList, createSkeletonList, spacer } from '../utils/uiHelpers.js';
import { COLORS } from '../constants/index.js';

interface WorkspaceSelectionProps {
  workspaces: string[];
  selectedWorkspace: number;
  loading: boolean;
  error: string;
  currentItem: { name: string; workspace: string } | null;
  terminalHeight?: number;
}

export const WorkspaceSelection: React.FC<WorkspaceSelectionProps> = React.memo(({
  workspaces,
  selectedWorkspace,
  loading,
  error,
  currentItem,
  terminalHeight = 24
}) => {
  const elements: ReactElement[] = [
    createText({ key: 'title', bold: true, color: COLORS.PRIMARY }, 'Move Item to Workspace'),
    spacer()
  ];

  if (currentItem) {
    elements.push(
      createText({ key: 'item-info', color: COLORS.PRIMARY }, 
        `📝 Moving: ${currentItem.name}`
      ),
      createText({ key: 'from-info', color: COLORS.SECONDARY }, 
        `📂 From: ${currentItem.workspace}`
      ),
      spacer('item-spacer')
    );
  }

  if (loading) {
    elements.push(
      createText({ key: 'workspace-loading', color: COLORS.SUCCESS, bold: true },
        'Loading workspaces...'
      ),
      spacer('loading-spacer')
    );
    // Show skeleton items while loading
    const skeletonItems = createSkeletonList(5, 0);
    elements.push(...skeletonItems);
  } else if (error) {
    elements.push(...createErrorDisplay(error, 'workspaces'));
    elements.push(
      createText({ key: 'retry-tip', color: COLORS.SECONDARY, italic: true },
        'Press Enter to retry or check your network connection'
      )
    );
  } else if (workspaces.length > 0) {
    // Filter out the current workspace from the list
    const availableWorkspaces = workspaces.filter(ws => ws !== currentItem?.workspace);
    
    if (availableWorkspaces.length > 0) {
      // Calculate available space for list items
      // Reserve space for: title (1) + spacer (1) + item info (2) + spacer (1) + found text (1) + spacer (1) + separator (1) + return menu (1) + padding (2) = 11 lines
      const reservedLines = 11;
      const availableLines = Math.max(3, terminalHeight - reservedLines);
      const maxVisibleItems = Math.min(availableLines, availableWorkspaces.length);
      
      elements.push(
        createText({ key: 'workspace-title', color: COLORS.SUCCESS, bold: true },
          `Select destination workspace (${availableWorkspaces.length} available):`
        ),
        spacer('spacer2')
      );
      
      // Add paginated workspace items
      // If "Return to Item Actions" is selected, show the last items in the list
      const effectiveSelectedIndex = selectedWorkspace >= availableWorkspaces.length 
        ? availableWorkspaces.length - 1 
        : selectedWorkspace;
        
      const paginatedWorkspaces = createPaginatedList(
        availableWorkspaces,
        effectiveSelectedIndex,
        (workspace, index, isSelected) => 
          createMenuItem(workspace, index, selectedWorkspace === index ? index : -1, COLORS.SUCCESS_BG),
        maxVisibleItems
      );
      
      elements.push(...paginatedWorkspaces);
      
      elements.push(
        spacer('separator'),
        createMenuItem('Return to Item Actions', availableWorkspaces.length, selectedWorkspace, COLORS.SECONDARY)
      );
    } else {
      elements.push(
        createText({ key: 'no-other-workspaces', color: COLORS.WARNING }, 
          '⚠️  No other workspaces available'
        ),
        createText({ key: 'same-workspace-tip', color: COLORS.SECONDARY, italic: true },
          'The item is already in the only available workspace'
        ),
        spacer('separator'),
        createMenuItem('Return to Item Actions', 0, selectedWorkspace, COLORS.SECONDARY)
      );
    }
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