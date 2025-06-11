import React, { ReactElement } from 'react';
import { createFullWidthBox, createText, spacer } from '../utils/uiHelpers.js';
import { COLORS } from '../constants/index.js';

interface TextInputProps {
  title: string;
  placeholder: string;
  value: string;
  instructions?: string;
}

export const TextInput: React.FC<TextInputProps> = React.memo(({
  title,
  placeholder,
  value,
  instructions = 'Type your input, Enter to confirm, Escape to cancel'
}) => {

  const displayValue = value || placeholder;
  const isPlaceholder = !value;
  
  const elements: ReactElement[] = [
    createText({ key: 'title', bold: true, color: COLORS.PRIMARY }, title),
    spacer('spacer1'),
    createText({ key: 'instructions', color: COLORS.SECONDARY }, instructions),
    spacer('spacer2'),
    createText({ key: 'input-label', color: COLORS.WARNING }, 'Input:'),
    createText({ 
      key: 'input-value', 
      color: isPlaceholder ? COLORS.SECONDARY : COLORS.PRIMARY,
      dimColor: isPlaceholder
    }, `${displayValue}█`)
  ];

  return createFullWidthBox({ 
    padding: 1, 
    alignItems: 'flex-start',
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    overflowY: 'hidden'
  }, elements.filter(Boolean));
});