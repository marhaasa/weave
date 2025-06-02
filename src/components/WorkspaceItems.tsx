import React, { ReactElement } from 'react';
import { createBox, createText, createMenuItem, createLoadingDisplay, createErrorDisplay, spacer } from '../utils/uiHelpers.js';
import { ParsingUtils } from '../utils/parsing.js';
import { COLORS } from '../constants/index.js';
import type { WorkspaceItem } from '../types/index.js';

interface WorkspaceItemsProps {
  items: (string | WorkspaceItem)[];
  selectedItem: number;
  workspaceName: string;
  loading: boolean;
  error: string;
}

export const WorkspaceItems: React.FC<WorkspaceItemsProps> = React.memo(({
  items,
  selectedItem,
  workspaceName,
  loading,
  error
}) => {
  const elements: ReactElement[] = [
    createText({ key: 'title', bold: true, color: COLORS.PRIMARY }, 'Workspace Items'),
    spacer()
  ];

  if (loading) {
    elements.push(createLoadingDisplay('Loading workspace items...', 'items'));
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

    items.forEach((item, index) => {
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

      elements.push(
        createMenuItem(
          `${itemObj.name}${icon}`,
          index,
          selectedItem,
          COLORS.WARNING_BG
        )
      );
    });

    elements.push(
      spacer('separator'),
      createMenuItem('Return to Workspaces', items.length, selectedItem, COLORS.SECONDARY)
    );
  } else if (!loading) {
    elements.push(
      createText({ key: 'no-items', color: COLORS.WARNING }, '⚠️  No items found in workspace'),
      spacer('empty-spacer'),
      createText({ key: 'empty-instruction', color: COLORS.SECONDARY, italic: true },
        "This workspace is empty. Press 'q' to return to workspaces"
      )
    );
  }

  return createBox({ flexDirection: 'column', padding: 1 }, elements);
});
