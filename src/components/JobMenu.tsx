import React, { ReactElement } from 'react';
import { createBox, createText, createMenuItem, spacer } from '../utils/uiHelpers.js';
import { COLORS } from '../constants/index.js';
import type { JobInfo } from '../types/index.js';

interface JobMenuProps {
  job: JobInfo;
  selectedOption: number;
}

export const JobMenu: React.FC<JobMenuProps> = React.memo(({ job, selectedOption }) => {
  const elements: ReactElement[] = [
    createText({ key: 'title', bold: true, color: COLORS.SUCCESS }, '✅ Job Started Successfully!'),
    spacer('spacer1'),
    createText({ key: 'job-info', color: COLORS.PRIMARY }, `📓 Notebook: ${job.notebook}`),
    createText({ key: 'workspace-info', color: COLORS.PRIMARY }, `📁 Workspace: ${job.workspace}`),
    createText({ key: 'job-id', color: COLORS.SECONDARY }, `🔖 Job ID: ${job.jobId}`),
    spacer('spacer2'),
    createText({ key: 'menu-title', color: COLORS.PRIMARY, bold: true }, 'What would you like to do?'),
    spacer('spacer3')
  ];

  const options = [
    'Check Job Status',
    'Run Job Synchronously (Wait for completion)',
    'Return to Workspace Items'
  ];

  options.forEach((option, index) => {
    elements.push(createMenuItem(option, index, selectedOption, COLORS.WARNING_BG));
  });

  elements.push(
    spacer('spacer4'),
    createText({ key: 'instructions', color: COLORS.SECONDARY, italic: true },
      'Use ↑/↓ to navigate, Enter to select'
    )
  );

  return createBox({ flexDirection: 'column', padding: 1 }, elements);
});