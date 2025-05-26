import React, { ReactElement } from 'react';
import { Box, Text } from 'ink';
import { COLORS } from '../constants/index.js';

export const h = React.createElement;

export const createText = (props: any, text: string): ReactElement => h(Text, props, text);
export const createBox = (props: any, children: ReactElement[]): ReactElement => h(Box, props, children);
export const spacer = (key: string = 'spacer'): ReactElement => h(Box, { key, height: 1 });

export const createMenuItem = (
  label: string,
  index: number,
  selectedIndex: number,
  bgColor: string = COLORS.HIGHLIGHT_BG
): ReactElement =>
  createText({
    key: `menu-item-${index}`,
    color: index === selectedIndex ? 'black' : 'white',
    backgroundColor: index === selectedIndex ? bgColor : undefined
  }, label);

export const createErrorDisplay = (error: string, keyPrefix: string = ''): ReactElement[] => [
  createText({ key: `${keyPrefix}error-title`, color: COLORS.ERROR, bold: true }, '❌ Error:'),
  createText({ key: `${keyPrefix}error-text`, color: COLORS.ERROR }, error)
];

export const createLoadingDisplay = (message: string = 'Loading...', keyPrefix: string = ''): ReactElement =>
  createText({ key: `${keyPrefix}loading`, color: COLORS.WARNING }, `⏳ ${message}`);