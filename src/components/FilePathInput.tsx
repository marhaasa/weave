import React, { ReactElement, useState } from 'react';
import { createFullWidthBox, createText, createMenuItem, spacer } from '../utils/uiHelpers.js';
import { COLORS } from '../constants/index.js';

interface FilePathInputProps {
  title: string;
  currentPath: string;
  selectedOption: number;
  onPathChange: (path: string) => void;
}

export const FilePathInput: React.FC<FilePathInputProps> = React.memo(({
  title,
  currentPath,
  selectedOption,
  onPathChange
}) => {
  const elements: ReactElement[] = [
    createText({ key: 'title', bold: true, color: COLORS.PRIMARY }, title),
    spacer('spacer1'),
    createText({ key: 'current-path', color: COLORS.WARNING }, `Current path: ${currentPath || '(not set)'}`),
    spacer('spacer2'),
    createText({ key: 'instructions', color: COLORS.SECONDARY }, 'Use arrow keys to navigate, Enter to select, type to edit path'),
    spacer('spacer3')
  ];

  const options = [
    'Edit Path Manually',
    'Use Default Path (/tmp)',
    'Confirm and Continue'
  ];

  options.forEach((option, index) => {
    elements.push(createMenuItem(option, index, selectedOption, COLORS.WARNING_BG));
  });

  elements.push(
    spacer('separator'),
    createMenuItem('Cancel / Go Back', options.length, selectedOption, COLORS.SECONDARY)
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