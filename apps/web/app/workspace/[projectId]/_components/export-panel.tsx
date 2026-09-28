'use client';

import type { ExportFormat } from '@pod-vector-studio/shared';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiError, api } from '@/lib/api-client';
import type { JobDTO } from '@/lib/jobs';
import { useJob } from '@/lib/use-job';

interface Props {
  projectId: string;
  hasVector: boolean;
  vectorStale: boolean;
  /** The vector was traced with the original background still in the image. */
  vectorHasBackground: boolean;
}

/**
 * Ask for a short-lived signed URL (Content-Disposition: attachment) and let the browser save
 * it. A hidden iframe (not a link click) so a failed/expired URL can never navigate the app away.
 */
async function download(assetId: string) {
  const { url } = await api<{ url: string }>(`/api/assets/${assetId}/download`);
  const frame = document.createElement('iframe');
  frame.style.display = 'none';
  frame.src = url;
  document.body.appendChild(frame);
  setTimeout(() => frame.remove(), 60_000);
}

function ExportButton({ projectId, format, label, disabled }: { projectId: string; format: ExportFormat; label: string; disabled: boolean }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: job } = useJob(jobId);
  const downloaded = useRef<string | null>(null);

  // When the followed job completes, download its result (once).
  useEffect(() => {
    if (job?.status === 'completed' && job.resultAssetId && downloaded.current !== job.id) {
      downloaded.current = job.id;
      download(job.resultAssetId).catch((e: Error) => setError(e.message));
    }
    if (job?.status === 'failed') setError(job.errorMessage ?? 'Export failed.');
  }, [job]);

  async function start() {
    setStarting(true);
    setError(null);
    downloaded.current = null;
    try {
      const res = await api<{ job: JobDTO }>(`/api/projects/${projectId}/export`, { method: 'POST', body: { format } });
      setJobId(res.job.id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setJobId((e.data.job as JobDTO).id);
      else setError(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setStarting(false);
    }
  }

  const busy = starting || job?.status === 'queued' || job?.status === 'processing';
  return (
    <div className="space-y-1">
      <Button variant="outline" className="w-full justify-between" disabled={disabled || busy} onClick={start}>
        <span>{label}</span>
        <span className="text-xs text-muted-foreground">{busy ? 'Preparing…' : format.toUpperCase()}</span>
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function ExportPanel({ projectId, hasVector, vectorStale, vectorHasBackground }: Props) {
  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Export</h2>
      {!hasVector ? (
        <p className="text-xs text-muted-foreground">Vectorize the design to export it.</p>
      ) : (
        <>
          {vectorStale && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Exports use the last vector. Vectorize again to include your latest changes.
            </p>
          )}
          <ExportButton projectId={projectId} format="svg" label="Download vector" disabled={!hasVector} />
          <ExportButton
            projectId={projectId}
            format="png"
            label={vectorHasBackground ? 'Download PNG' : 'Download transparent PNG'}
            disabled={!hasVector}
          />
          <p className="text-xs text-muted-foreground">
            {vectorHasBackground
              ? 'The background is part of this vector. Remove it and vectorize again for a transparent file.'
              : 'PNG is rendered from the vector at the original image size.'}
          </p>
        </>
      )}
    </div>
  );
}
