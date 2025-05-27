import React, { ReactElement } from 'react';
import { LoadingOrError } from './LoadingOrError.js';
import { createBox, createText, spacer, h } from '../utils/uiHelpers.js';
import { ParsingUtils } from '../utils/parsing.js';
import { COLORS, STATUS_CONFIG } from '../constants/index.js';
import type { JobInfo } from '../types/index.js';

interface JobStatusViewProps {
  output: string;
  jobInfo: JobInfo;
  loading: boolean;
  error: string;
}

export const JobStatusView: React.FC<JobStatusViewProps> = React.memo(({ output, jobInfo, loading, error }) => {
  const elements: ReactElement[] = [
    createText({ key: 'title', bold: true, color: COLORS.PRIMARY }, '📊 Job Status'),
    createText({ key: 'job-info', color: COLORS.SECONDARY }, `Notebook: ${jobInfo.notebook}`),
    spacer()
  ];

  const loadingOrError = h(LoadingOrError, {
    key: 'loading-error',
    loading,
    error,
    loadingMessage: 'Checking job status...'
  });

  if (loadingOrError) {
    elements.push(loadingOrError);
  } else if (output) {
    const statusInfo = ParsingUtils.parseJobStatus(output);
    const statusConfig = STATUS_CONFIG[statusInfo.status] || STATUS_CONFIG['Unknown'];

    elements.push(
      createText({ key: 'status', bold: true, color: statusConfig.color },
        `${statusConfig.icon} Status: ${statusInfo.status}`
      ),
      createText({ key: 'start-time', color: COLORS.PRIMARY },
        `🚀 Start Time: ${ParsingUtils.formatDateTime(statusInfo.startTime)}`
      ),
      createText({ key: 'end-time', color: COLORS.PRIMARY },
        `🏁 End Time: ${statusInfo.endTime ? ParsingUtils.formatDateTime(statusInfo.endTime) : 'Still running...'}`
      )
    );

    if (statusInfo.status === 'InProgress') {
      elements.push(
        spacer('spacer3'),
        createText({ key: 'duration', color: COLORS.SECONDARY, italic: true },
          `Running for ${Math.floor((Date.now() - jobInfo.startTime) / 1000)} seconds...`
        )
      );
    }
  }

  elements.push(
    spacer('spacer-final'),
    createText({ key: 'instructions', color: COLORS.SECONDARY, italic: true },
      "Press 'r' to refresh, Enter to return to job menu, 'q' to return to main menu"
    )
  );

  return createBox({ flexDirection: 'column', padding: 1 }, elements);
});
