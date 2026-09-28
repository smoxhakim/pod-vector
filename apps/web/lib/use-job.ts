'use client';

import { TERMINAL_JOB_STATUSES } from '@pod-vector-studio/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError, api } from './api-client';
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

/**
 * Start a job via POST `url`, follow it to completion, then refresh the page's server data.
 * A 409 (job already running for this version) just attaches to the running job.
 */
export function useStartJob(url: string, activeJobId: string | null) {
  const router = useRouter();
  const [jobId, setJobId] = useState<string | null>(activeJobId);
  const { data: job } = useJob(jobId);

  const start = useMutation({
    mutationFn: (body: unknown) => api<{ job: JobDTO | null }>(url, { method: 'POST', body }),
    onSuccess: ({ job }) => (job ? setJobId(job.id) : router.refresh()),
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) setJobId((err.data.job as JobDTO).id);
    },
  });

  useEffect(() => {
    if (job?.status === 'completed') router.refresh();
  }, [job?.status, router]);

  const running = start.isPending || job?.status === 'queued' || job?.status === 'processing';
  const startError = start.error && !(start.error instanceof ApiError && start.error.status === 409) ? start.error.message : null;
  const error = job?.status === 'failed' ? job.errorMessage : startError;
  return { start: start.mutate, job, running, error };
}
