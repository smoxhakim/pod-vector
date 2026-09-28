'use client';

import { Button } from '@/components/ui/button';
import { useStartJob } from '@/lib/use-job';

interface Props {
  projectId: string;
  hasSource: boolean;
  hasVector: boolean;
  /** The vector was traced from an image that has since changed (e.g. background removed). */
  vectorStale: boolean;
  /** A vectorize job already queued/running when the page loaded. */
  activeJobId: string | null;
}

export function VectorizePanel({ projectId, hasSource, hasVector, vectorStale, activeJobId }: Props) {
  const { start, job, running, error } = useStartJob(`/api/projects/${projectId}/vectorize`, activeJobId);

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vectorize</h2>
      <div className="rounded-md bg-muted px-3 py-2 text-xs">
        <span className="font-medium">Logo mode</span>
        <span className="block text-muted-foreground">Flat colours, clean paths. Best for logos, icons and simple art.</span>
      </div>
      {vectorStale && !running && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          The image changed since the last vectorization. Vectorize again to update it.
        </p>
      )}
      <Button className="w-full" disabled={!hasSource || running} onClick={() => start({ mode: 'logo' })}>
        {running ? (job?.status === 'processing' ? 'Tracing…' : 'Queued…') : hasVector ? 'Vectorize again' : 'Vectorize'}
      </Button>
      {!hasSource && <p className="text-xs text-muted-foreground">Upload an image first.</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {job?.status === 'completed' && <p className="text-xs text-emerald-700">Done — real vector paths, no embedded pixels.</p>}
    </div>
  );
}
