import React, { ReactElement } from 'react';
import { createFullWidthBox, createText, createMenuItem, spacer } from '../utils/uiHelpers.js';
import { COLORS } from '../constants/index.js';
import { ParsingUtils } from '../utils/parsing.js';

interface ItemActionsMenuProps {
  itemName: string;
  workspace: string;
  selectedOption: number;
}

export const ItemActionsMenu: React.FC<ItemActionsMenuProps> = React.memo(({
  itemName,
  workspace,
  selectedOption
}) => {

  // Determine item type and appropriate icon/title
  const isNotebook = ParsingUtils.isNotebook(itemName);
  const isDataPipeline = ParsingUtils.isDataPipeline(itemName);
  const isSparkJobDefinition = ParsingUtils.isSparkJobDefinition(itemName);

  let icon = '📓';
  let title = 'Notebook Actions';

  if (isDataPipeline) {
    icon = '🔄';
    title = 'Pipeline Actions';
  } else if (isSparkJobDefinition) {
    icon = '⚡';
    title = 'Spark Job Definition Actions';
  }

  const elements: ReactElement[] = [
    createText({ key: 'title', bold: true, color: COLORS.PRIMARY }, title),
    spacer('spacer1'),
    createText({ key: 'item-info', color: COLORS.PRIMARY }, `${icon} ${itemName}`),
    spacer('spacer2'),
    createText({ key: 'menu-title', color: COLORS.PRIMARY, bold: true }, 'What would you like to do?'),
    spacer('spacer3')
  ];

  const options = [
    'Run (Start job in background)',
    'Run Job Synchronously (Wait for completion)',
    'View Last Job Details',
    'Export Item to File',
    'Move Item to Another Workspace',
    'Copy Item to Another Workspace'
  ];

  options.forEach((option, index) => {
    elements.push(createMenuItem(option, index, selectedOption, COLORS.WARNING_BG));
  });

  elements.push(
    spacer('separator'),
    createMenuItem('Return to Workspace Items', options.length, selectedOption, COLORS.SECONDARY)
  );

  return createFullWidthBox({ 
    padding: 1, 
    alignItems: 'flex-start',
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    overflowY: 'hidden'
  }, elements.filter(Boolean));
});