'use client';

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import type { JobDTO } from '@/lib/jobs';
import { useJob } from '@/lib/use-job';

/** Dev-only: fire a no-op job and watch it move through the queue. */
export function DevJobPanel({ projectId }: { projectId: string }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const start = useMutation({
    mutationFn: (fail: boolean) =>
      api<{ job: JobDTO }>('/api/dev/noop-job', { method: 'POST', body: { projectId, fail } }),
    onSuccess: ({ job }) => setJobId(job.id),
  });
  const { data: job } = useJob(jobId);

  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dev · job queue</h2>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={start.isPending} onClick={() => start.mutate(false)}>
          Test job
        </Button>
        <Button size="sm" variant="ghost" disabled={start.isPending} onClick={() => start.mutate(true)}>
          Failing job
        </Button>
      </div>
      {start.error && <p className="text-xs text-destructive">{start.error.message}</p>}
      {job && (
        <p className="text-xs text-muted-foreground">
          Job {job.id.slice(0, 8)}: <span className="font-medium text-foreground">{job.status}</span>
          {job.errorMessage && <span className="block text-destructive">{job.errorMessage}</span>}
        </p>
      )}
    </div>
  );
}
