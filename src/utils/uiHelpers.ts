import React, { ReactElement } from 'react';
import { Box, Text } from 'ink';
import { COLORS } from '../constants/index.js';

export const h = React.createElement;

export const createText = (props: any, text: string): ReactElement => h(Text, props, text);
export const createBox = (props: any, children: ReactElement[]): ReactElement => h(Box, props, children);

export const createFullWidthBox = (props: any, children: ReactElement[]): ReactElement =>
  h(Box, { 
    ...props, 
    width: '100%',
    flexDirection: props.flexDirection || 'column'
  }, children);

export const createCenteredBox = (props: any, children: ReactElement[]): ReactElement =>
  h(Box, { 
    ...props,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: props.flexDirection || 'column'
  }, children);
export const spacer = (key: string = 'spacer'): ReactElement => h(Box, { key, height: 1 });

export const createMenuItem = (
  label: string,
  index: number,
  selectedIndex: number,
  bgColor: string = COLORS.HIGHLIGHT_BG,
  extraProps?: any
): ReactElement =>
  createText({
    key: `menu-item-${index}`,
    color: index === selectedIndex ? 'black' : 'white',
    backgroundColor: index === selectedIndex ? bgColor : undefined,
    ...extraProps
  }, label);

export const createErrorDisplay = (error: string, keyPrefix: string = ''): ReactElement[] => [
  createText({ key: `${keyPrefix}error-title`, color: COLORS.ERROR, bold: true }, '❌ Error:'),
  createText({ key: `${keyPrefix}error-text`, color: COLORS.ERROR }, error)
];

export const createLoadingDisplay = (message: string = 'Loading...', keyPrefix: string = ''): ReactElement =>
  createText({ key: `${keyPrefix}loading`, color: COLORS.WARNING }, `⏳ ${message}`);

export const createSkeletonItem = (index: number, isSelected: boolean = false): ReactElement => {
  const skeletonText = '█'.repeat(Math.floor(Math.random() * 20) + 10);
  return createMenuItem(
    `${skeletonText}`,
    index,
    isSelected ? index : -1,
    COLORS.SECONDARY,
    { dimColor: true, italic: true }
  );
};

export const createSkeletonList = (count: number, selectedIndex: number = -1): ReactElement[] => {
  return Array.from({ length: count }, (_, index) => 
    createSkeletonItem(index, index === selectedIndex)
  );
};

export const createHeader = (title: string, key: string = 'header'): ReactElement =>
  createText({ 
    key, 
    bold: true, 
    color: COLORS.PRIMARY,
    backgroundColor: COLORS.SECONDARY,
    wrap: 'wrap'
  }, ` ${title} `);

export const createDivider = (key: string = 'divider'): ReactElement =>
  createText({ 
    key, 
    color: COLORS.SECONDARY,
    dimColor: true
  }, '─'.repeat(50));

export const createScrollableList = (
  props: any, 
  children: ReactElement[],
  maxHeight?: number
): ReactElement =>
  h(Box, { 
    ...props, 
    flexDirection: 'column',
    height: maxHeight || '100%',
    overflowY: 'hidden',
    width: '100%'
  }, children);

export const createPaginatedList = (
  items: string[],
  selectedIndex: number,
  createItemFn: (item: string, index: number, isSelected: boolean) => ReactElement,
  maxVisibleItems: number = 10
): ReactElement[] => {
  if (items.length === 0) return [];
  
  const totalItems = items.length;
  const halfVisible = Math.floor(maxVisibleItems / 2);
  
  let startIndex = Math.max(0, selectedIndex - halfVisible);
  let endIndex = Math.min(totalItems, startIndex + maxVisibleItems);
  
  // Adjust if we're near the end
  if (endIndex === totalItems) {
    startIndex = Math.max(0, totalItems - maxVisibleItems);
  }
  
  const visibleItems: ReactElement[] = [];
  
  // Add scroll indicator at top if needed
  if (startIndex > 0) {
    visibleItems.push(
      createText(
        { key: 'scroll-up', color: COLORS.SECONDARY, dimColor: true },
        `↑ ${startIndex} more items above`
      )
    );
  }
  
  // Add visible items
  for (let i = startIndex; i < endIndex; i++) {
    visibleItems.push(createItemFn(items[i], i, i === selectedIndex));
  }
  
  // Add scroll indicator at bottom if needed
  if (endIndex < totalItems) {
    visibleItems.push(
      createText(
        { key: 'scroll-down', color: COLORS.SECONDARY, dimColor: true },
        `↓ ${totalItems - endIndex} more items below`
      )
    );
  }
  
  return visibleItems;
};