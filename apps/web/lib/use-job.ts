'use client';

import { TERMINAL_JOB_STATUSES } from '@pod-vector-studio/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from './api-client';
import type { JobDTO } from './jobs';

const POLL_MS = 1000;

/** Polls GET /api/jobs/:id every second until the job completes or fails. */
export function useJob(jobId: string | null | undefined) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: () => api<{ job: JobDTO }>(`/api/jobs/${jobId}`).then((r) => r.job),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && (TERMINAL_JOB_STATUSES as readonly string[]).includes(status) ? false : POLL_MS;
    },
  });
}
