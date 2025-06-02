import type { ParseLinesFilters, StatusInfo, WorkspaceItem } from '../types/index.js';

export const ParsingUtils = {
  cleanOutput: (output: string): string => output
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\r\n/g, '\n')
    .trim(),

  parseLines: (output: string, filters: ParseLinesFilters = {}): string[] => {
    const defaultFilters: Required<ParseLinesFilters> = {
      skipEmpty: true,
      skipHeaders: true,
      skipPatterns: ['Listing', 'ID', '─']
    };

    const { skipEmpty, skipHeaders, skipPatterns } = { ...defaultFilters, ...filters };

    return output
      .split('\n')
      .map(line => line.trim())
      .filter(line => {
        if (skipEmpty && !line) return false;
        if (skipHeaders && skipPatterns.some(pattern => line.startsWith(pattern))) return false;
        return true;
      });
  },

  parseWorkspaces: (output: string): string[] => {
    return ParsingUtils.parseLines(output)
      .map(line => {
        if (line.includes('.')) {
          return line.split('.')[0].trim();
        }
        return line.trim();
      })
      .filter(name => name && name.length > 0);
  },

  parseWorkspaceItems: (output: string): WorkspaceItem[] => {
    return ParsingUtils.parseLines(output)
      .filter(item => item && item.length > 0)
      .map(item => ({
        name: item.trim(),
        isNotebook: item.endsWith('.Notebook'),
        isDataPipeline: item.endsWith('.DataPipeline'),
        isSparkJobDefinition: item.endsWith('.SparkJobDefinition')
      }));
  },

  extractJobId: (output: string): string | null => {
    const match = output.match(/Job instance '([a-f0-9-]+)' created/i);
    return match ? match[1] : null;
  },

  extractGuid: (text: string): string | null => {
    const match = text.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
    return match ? match[1] : null;
  },

  parseJobStatus: (output: string): StatusInfo => {
    const lines = output.split('\n');
    let statusInfo: StatusInfo = {
      status: 'Unknown',
      startTime: null,
      endTime: null,
      jobType: null
    };

    for (const line of lines) {
      if (!line.trim() || line.includes('──────') || line.includes('id') || line.includes('itemId')) continue;

      if (ParsingUtils.extractGuid(line)) {
        const cleanLine = line.replace(/^\s*│\s*/, '').replace(/\s*│\s*$/, '').trim();

        const statusMatch = cleanLine.match(/\b(InProgress|Completed|Failed|NotStarted|Succeeded)\b/i);
        if (statusMatch) {
          statusInfo.status = statusMatch[1];
        }

        const jobTypeMatch = cleanLine.match(/\b(RunNotebook|RunPipeline|RunDataPipeline|RunSparkJobDefinition)\b/i);
        if (jobTypeMatch) {
          statusInfo.jobType = jobTypeMatch[1];
        }

        const timestamps = cleanLine.match(/\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g);
        if (timestamps && timestamps.length > 0) {
          statusInfo.startTime = timestamps[0].replace(' ', 'T');
          if (!statusInfo.startTime.includes('Z') && !statusInfo.startTime.match(/[+-]\d{2}:?\d{2}$/)) {
            statusInfo.startTime += 'Z';
          }

          if (timestamps.length > 1 && timestamps[timestamps.length - 1] !== timestamps[0]) {
            statusInfo.endTime = timestamps[timestamps.length - 1].replace(' ', 'T');
            if (!statusInfo.endTime.includes('Z') && !statusInfo.endTime.match(/[+-]\d{2}:?\d{2}$/)) {
              statusInfo.endTime += 'Z';
            }
          }
        }

        break;
      }
    }

    if (statusInfo.endTime === 'None' || statusInfo.endTime === statusInfo.startTime) {
      statusInfo.endTime = null;
    }

    return statusInfo;
  },

  formatDateTime: (dateTimeStr: string | null): string => {
    if (!dateTimeStr || dateTimeStr === 'None') return 'N/A';
    try {
      const date = new Date(dateTimeStr);
      if (isNaN(date.getTime())) {
        console.error('Invalid date:', dateTimeStr);
        return dateTimeStr;
      }
      return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZoneName: 'short'
      });
    } catch (error) {
      console.error('Error formatting date:', error, dateTimeStr);
      return dateTimeStr;
    }
  },

  isNotebook: (item: string | WorkspaceItem): boolean => {
    return typeof item === 'string' ? item.endsWith('.Notebook') : item.isNotebook;
  },

  isDataPipeline: (item: string | WorkspaceItem): boolean => {
    return typeof item === 'string' ? item.endsWith('.DataPipeline') : (item as any).isDataPipeline || false;
  },

  isSparkJobDefinition: (item: string | WorkspaceItem): boolean => {
    return typeof item === 'string' ? item.endsWith('.SparkJobDefinition') : (item as any).isSparkJobDefinition || false;
  },

  supportsJobActions: (item: string | WorkspaceItem): boolean => {
    return ParsingUtils.isNotebook(item) || ParsingUtils.isDataPipeline(item) || ParsingUtils.isSparkJobDefinition(item);
  }
};
