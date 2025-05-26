import React, { ReactElement } from 'react';
import { createBox, createText, createMenuItem, spacer } from '../utils/uiHelpers.js';
import { COLORS } from '../constants/index.js';
import type { JobInfo } from '../types/index.js';

interface NotebookActionsMenuProps {
  notebook: string;
  workspace: string;
  selectedOption: number;
  completedJobs: Set<string>;
  activeJobs: JobInfo[];
  currentJob: JobInfo | null;
}

export const NotebookActionsMenu: React.FC<NotebookActionsMenuProps> = React.memo(({
  notebook,
  workspace,
  selectedOption,
  completedJobs,
  activeJobs,
  currentJob
}) => {
  const jobKey = `${workspace}/${notebook}`;
  const hasJobCompleted = completedJobs && completedJobs.has(jobKey);

  const elements: ReactElement[] = [
    createText({ key: 'title', bold: true, color: COLORS.PRIMARY }, 'Notebook Actions'),
    spacer('spacer1'),
    createText({ key: 'notebook-info', color: COLORS.PRIMARY }, `📓 ${notebook}`),
    ...(hasJobCompleted ? [createText({ key: 'job-status', color: COLORS.SUCCESS }, `✅ Job has been run and completed`)] : []),
    spacer('spacer2'),
    createText({ key: 'menu-title', color: COLORS.PRIMARY, bold: true }, 'What would you like to do?'),
    spacer('spacer3')
  ];

  const options = [
    'Run (Start job in background)',
    'Run Job Synchronously (Wait for completion)',
    'View Last Job Details'
  ];

  options.forEach((option, index) => {
    elements.push(createMenuItem(option, index, selectedOption, COLORS.WARNING_BG));
  });

  elements.push(
    spacer('separator'),
    createMenuItem('Return to Workspace Items', options.length, selectedOption, COLORS.SECONDARY)
  );

  return createBox({ flexDirection: 'column', padding: 1 }, elements.filter(Boolean));
});