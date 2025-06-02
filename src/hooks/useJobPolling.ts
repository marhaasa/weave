import { useEffect, useRef } from 'react';
import type { JobInfo, StatusInfo } from '../types/index.js';
import type { FabricService } from '../services/fabricService.js';

interface JobPollingHook {
  activeJobs: JobInfo[];
  fabricService: FabricService;
  onJobStatusUpdate: (jobId: string, status: StatusInfo) => void;
  onJobCompleted: (workspace: string, itemName: string) => void;
  pollingInterval?: number;
}

export const useJobPolling = ({
  activeJobs,
  fabricService,
  onJobStatusUpdate,
  onJobCompleted,
  pollingInterval = 5000 // 5 seconds default
}: JobPollingHook): void => {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef<boolean>(false);

  const pollJobStatuses = async () => {
    if (isPollingRef.current || activeJobs.length === 0) {
      return;
    }

    isPollingRef.current = true;

    try {
      // Poll all active jobs in parallel for better performance
      const statusPromises = activeJobs.map(async (job) => {
        try {
          const statusInfo = await fabricService.getJobStatus(
            job.workspace,
            job.notebook,
            job.jobId
          );
          
          // Notify about status update
          onJobStatusUpdate(job.jobId, statusInfo);
          
          // Check if job is completed
          if (['Completed', 'Succeeded', 'Failed'].includes(statusInfo.status)) {
            onJobCompleted(job.workspace, job.notebook);
          }
          
          return { jobId: job.jobId, status: statusInfo.status };
        } catch (error) {
          console.warn(`Failed to poll job ${job.jobId}:`, error);
          return { jobId: job.jobId, status: 'Unknown' };
        }
      });

      await Promise.allSettled(statusPromises);
    } catch (error) {
      console.warn('Job polling error:', error);
    } finally {
      isPollingRef.current = false;
    }
  };

  useEffect(() => {
    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Only start polling if there are active jobs
    if (activeJobs.length > 0) {
      // Initial poll
      pollJobStatuses();
      
      // Set up recurring polling
      intervalRef.current = setInterval(pollJobStatuses, pollingInterval);
    }

    // Cleanup on unmount or when activeJobs change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [activeJobs.length, pollingInterval]); // Re-run when active jobs count changes

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);
};

// Extended hook with smart polling intervals
export const useSmartJobPolling = (params: JobPollingHook): void => {
  const { activeJobs } = params;
  
  // Use shorter intervals when there are active jobs, longer when idle
  const smartInterval = activeJobs.length > 0 ? 3000 : 10000; // 3s active, 10s idle
  
  useJobPolling({
    ...params,
    pollingInterval: smartInterval
  });
};