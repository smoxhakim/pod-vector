'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiError, api } from '@/lib/api-client';
import type { JobDTO } from '@/lib/jobs';
import { useJob } from '@/lib/use-job';

interface Props {
  projectId: string;
  hasSource: boolean;
  hasVector: boolean;
  /** A vectorize job already queued/running when the page loaded. */
  activeJobId: string | null;
}

export function VectorizePanel({ projectId, hasSource, hasVector, activeJobId }: Props) {
  const router = useRouter();
  const [jobId, setJobId] = useState<string | null>(activeJobId);
  const { data: job } = useJob(jobId);

  const start = useMutation({
    mutationFn: () =>
      api<{ job: JobDTO }>(`/api/projects/${projectId}/vectorize`, { method: 'POST', body: { mode: 'logo' } }),
    onSuccess: ({ job }) => setJobId(job.id),
    onError: (err) => {
      // 409: a vectorization is already running for this version — follow it.
      if (err instanceof ApiError && err.status === 409) setJobId((err.data.job as JobDTO).id);
    },
  });

  // Show the new vector as soon as the worker finishes.
  useEffect(() => {
    if (job?.status === 'completed') router.refresh();
  }, [job?.status, router]);

  const running = start.isPending || job?.status === 'queued' || job?.status === 'processing';
  const error = job?.status === 'failed' ? job.errorMessage : start.error && !(start.error instanceof ApiError && start.error.status === 409) ? start.error.message : null;

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vectorize</h2>
      <div className="rounded-md bg-muted px-3 py-2 text-xs">
        <span className="font-medium">Logo mode</span>
        <span className="block text-muted-foreground">Flat colours, clean paths. Best for logos, icons and simple art.</span>
      </div>
      <Button className="w-full" disabled={!hasSource || running} onClick={() => start.mutate()}>
        {running ? (job?.status === 'processing' ? 'Tracing…' : 'Queued…') : hasVector ? 'Vectorize again' : 'Vectorize'}
      </Button>
      {!hasSource && <p className="text-xs text-muted-foreground">Upload an image first.</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {job?.status === 'completed' && <p className="text-xs text-emerald-700">Done — real vector paths, no embedded pixels.</p>}
    </div>
  );
}
