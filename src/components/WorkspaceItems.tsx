import React, { ReactElement } from 'react';
import { createFullWidthBox, createText, createMenuItem, createLoadingDisplay, createErrorDisplay, createPaginatedList, createSkeletonList, spacer } from '../utils/uiHelpers.js';
import { ParsingUtils } from '../utils/parsing.js';
import { COLORS } from '../constants/index.js';
import type { WorkspaceItem } from '../types/index.js';

interface WorkspaceItemsProps {
  items: (string | WorkspaceItem)[];
  selectedItem: number;
  workspaceName: string;
  loading: boolean;
  error: string;
  loadingProgress: number;
  terminalHeight?: number;
}

export const WorkspaceItems: React.FC<WorkspaceItemsProps> = React.memo(({
  items,
  selectedItem,
  workspaceName,
  loading,
  error,
  loadingProgress,
  terminalHeight = 24
}) => {
  const elements: ReactElement[] = [
    createText({ key: 'title', bold: true, color: COLORS.PRIMARY }, 'Workspace Items'),
    spacer()
  ];

  if (loading) {
    elements.push(
      createText({ key: 'items-loading', color: COLORS.SUCCESS, bold: true },
        'Loading workspace items...'
      ),
      spacer('loading-spacer')
    );
    // Show skeleton items while loading - same as workspaces
    // Use loadingProgress to trigger re-renders (which regenerates random skeleton patterns)
    const skeletonItems = createSkeletonList(5, -1); // -1 means no item selected
    elements.push(...skeletonItems);
  } else if (error) {
    elements.push(...createErrorDisplay(error, 'items'));
    elements.push(
      spacer('error-spacer'),
      createText({ key: 'return-instruction', color: COLORS.SECONDARY, italic: true },
        "Press 'q' or ESC to return to workspaces"
      )
    );
  } else if (items.length > 0) {
    const notebooks = items.filter(item => ParsingUtils.isNotebook(item));
    const dataPipelines = items.filter(item => ParsingUtils.isDataPipeline(item));
    const sparkJobs = items.filter(item => ParsingUtils.isSparkJobDefinition(item));
    const others = items.filter(item => !ParsingUtils.supportsJobActions(item));

    const jobItemsCount = notebooks.length + dataPipelines.length + sparkJobs.length;
    elements.push(
      createText({ key: 'items-summary', color: COLORS.SECONDARY },
        `${jobItemsCount} job-enabled item${jobItemsCount === 1 ? '' : 's'}, ${others.length} other item${others.length === 1 ? '' : 's'}`
      ),
      spacer('spacer2')
    );

    // Create a function to render an item with its icon
    const renderItem = (item: string | WorkspaceItem, index: number, isSelected: boolean): ReactElement => {
      const itemObj = typeof item === 'string' ? {
        name: item,
        isNotebook: ParsingUtils.isNotebook(item),
        isDataPipeline: ParsingUtils.isDataPipeline(item),
        isSparkJobDefinition: ParsingUtils.isSparkJobDefinition(item)
      } : item;

      let icon = '';
      if (itemObj.isNotebook) icon = ' 📓';
      else if (itemObj.isDataPipeline) icon = ' 🔄';
      else if (itemObj.isSparkJobDefinition) icon = ' ⚡';

      return createMenuItem(
        `${itemObj.name}${icon}`,
        index,
        isSelected ? index : -1,
        COLORS.WARNING_BG
      );
    };

    // Calculate available space for list items
    // Reserve space for: title (1) + spacer (1) + summary (1) + spacer (1) + separator (1) + return menu (1) + padding (2) = 8 lines
    const reservedLines = 8;
    const availableLines = Math.max(3, terminalHeight - reservedLines);
    const maxVisibleItems = Math.min(availableLines, items.length);
    
    // Convert items to strings for pagination (we'll map back to original items)
    const itemNames = items.map(item => typeof item === 'string' ? item : item.name);
    
    // If "Return to Workspaces" is selected, show the last items in the list
    const effectiveSelectedIndex = selectedItem >= items.length 
      ? items.length - 1 
      : selectedItem;
      
    const paginatedItems = createPaginatedList(
      itemNames,
      effectiveSelectedIndex,
      (itemName, index, isSelected) => renderItem(items[index], index, selectedItem === index),
      maxVisibleItems
    );
    
    elements.push(...paginatedItems);

    elements.push(
      spacer('separator'),
      createMenuItem('Return to Workspaces', items.length, selectedItem, COLORS.SECONDARY)
    );
  } else if (!loading && items.length === 0 && loadingProgress === 0) {
    elements.push(
      createText({ key: 'no-items', color: COLORS.WARNING }, '⚠️  No items found in workspace'),
      spacer('empty-spacer'),
      createText({ key: 'empty-instruction', color: COLORS.SECONDARY, italic: true },
        "This workspace is empty. Press 'q' to return to workspaces"
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
