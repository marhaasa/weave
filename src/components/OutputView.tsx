import React, { ReactElement } from 'react';
import { createBox, createText, spacer, createErrorDisplay } from '../utils/uiHelpers.js';
import { COLORS } from '../constants/index.js';
import type { JobInfo, NotebookInfo } from '../types/index.js';

interface OutputViewProps {
  output: string;
  error: string;
  loading: boolean;
  title?: string;
  activeJobs: JobInfo[];
  currentNotebook: NotebookInfo | null;
}

export const OutputView: React.FC<OutputViewProps> = React.memo(({
  output,
  error,
  loading,
  title,
  activeJobs,
  currentNotebook
}) => {
  const elements: ReactElement[] = [];

  if (error) {
    elements.push(...createErrorDisplay(error));
  }

  if (output) {
    const lines = output.split('\n');
    lines.forEach((line, index) => {
      if (line.trim()) {
        let color: string = COLORS.PRIMARY;
        let bold = false;

        if (line.includes('🔄') || line.includes('Starting')) {
          color = COLORS.PRIMARY;
          bold = true;
        } else if (line.includes('⏳') || line.includes('running')) {
          color = COLORS.WARNING;
        } else if (line.includes('✅') || line.includes('completed')) {
          color = COLORS.SUCCESS;
          bold = true;
        } else if (line.includes('❌') || line.includes('failed')) {
          color = COLORS.ERROR;
          bold = true;
        } else if (line.includes('💡 Press')) {
          color = COLORS.SECONDARY;
        }

        elements.push(createText({ key: `line-${index}`, color, bold }, line));
      } else {
        elements.push(spacer(`spacer-${index}`));
      }
    });
  }

  if (!loading && !output && !error) {
    elements.push(createText({ key: 'no-output', color: COLORS.WARNING }, 'No output received'));
  }

  return createBox({ flexDirection: 'column', padding: 1, height: '100%', overflowY: 'hidden' }, elements);
});