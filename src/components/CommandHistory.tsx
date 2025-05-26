import React, { ReactElement } from 'react';
import { createBox, createText, spacer } from '../utils/uiHelpers.js';
import { HistoryManager } from '../services/history.js';
import { COLORS, LIMITS } from '../constants/index.js';
import type { HistoryEntry } from '../types/index.js';

interface CommandHistoryProps {
  history: HistoryEntry[];
}

export const CommandHistory: React.FC<CommandHistoryProps> = React.memo(({ history }) => {
  const elements: ReactElement[] = [
    createText({ key: 'title', bold: true, color: COLORS.PRIMARY }, '📜 Command History'),
    createText({ key: 'instructions', color: COLORS.SECONDARY },
      "Press 'c' to clear history, 'q' to return to main menu"
    ),
    spacer()
  ];

  if (history.length === 0) {
    elements.push(
      createText({ key: 'no-history', color: COLORS.WARNING }, 'No command history yet')
    );
  } else {
    history.slice(0, LIMITS.HISTORY_DISPLAY).forEach((entry, index) => {
      const timeStr = HistoryManager.formatTimestamp(entry.timestamp);

      elements.push(
        createBox({ key: `entry-${index}`, flexDirection: 'column', marginBottom: 1 }, [
          createText({ key: 'time', color: COLORS.SECONDARY }, `[${timeStr}]`),
          createText({
            key: 'cmd',
            color: entry.success ? COLORS.SUCCESS : COLORS.ERROR
          }, `$ ${entry.command}`),
          ...(entry.output ? [createText({
            key: 'output',
            color: COLORS.SECONDARY,
            dimColor: true
          }, entry.output.substring(0, 80) + (entry.output.length > 80 ? '...' : ''))] : [])
        ])
      );
    });

    if (history.length > LIMITS.HISTORY_DISPLAY) {
      elements.push(
        createText({ key: 'more', color: COLORS.SECONDARY, italic: true },
          `... and ${history.length - LIMITS.HISTORY_DISPLAY} more entries`
        )
      );
    }
  }

  return createBox({ flexDirection: 'column', padding: 1 }, elements);
});