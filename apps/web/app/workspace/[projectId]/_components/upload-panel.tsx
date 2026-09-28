'use client';

import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_DIMENSION,
  MIN_UPLOAD_DIMENSION,
  SNIFF_BYTES,
  UPLOAD_TYPES,
  sniffImageFormat,
  type UploadContentType,
} from '@pod-vector-studio/shared';
import { useRouter } from 'next/navigation';
import { useRef, useState, type DragEvent } from 'react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const CONTENT_TYPE_BY_FORMAT = Object.fromEntries(
  Object.entries(UPLOAD_TYPES).map(([type, format]) => [format, type]),
) as Record<string, UploadContentType>;

type Phase = { kind: 'idle' } | { kind: 'uploading'; progress: number } | { kind: 'finishing' } | { kind: 'error'; message: string };

/** Client-side checks before spending an upload: real image signature, size, dimensions. */
async function inspectFile(file: File): Promise<{ contentType: UploadContentType; width: number; height: number }> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`File is too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).`);
  const format = sniffImageFormat(new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer()));
  if (!format) throw new Error('Upload a PNG, JPG or WEBP image.');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('This image could not be read. It may be corrupted.');
  }
  const { width, height } = bitmap;
  bitmap.close();
  if (Math.min(width, height) < MIN_UPLOAD_DIMENSION || Math.max(width, height) > MAX_UPLOAD_DIMENSION)
    throw new Error(`Image must be between ${MIN_UPLOAD_DIMENSION} and ${MAX_UPLOAD_DIMENSION}px per side (got ${width}×${height}).`);

  return { contentType: CONTENT_TYPE_BY_FORMAT[format], width, height };
}

/** PUT straight to R2 via XHR (fetch has no upload progress events). */
function putWithProgress(url: string, file: File, headers: Record<string, string>, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection (or the bucket CORS policy).'));
    xhr.send(file);
  });
}

export function UploadPanel({ projectId, hasSource }: { projectId: string; hasSource: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [dragging, setDragging] = useState(false);
  const busy = phase.kind === 'uploading' || phase.kind === 'finishing';

  async function upload(file: File) {
    try {
      const { contentType, width, height } = await inspectFile(file);
      setPhase({ kind: 'uploading', progress: 0 });
      const signed = await api<{ uploadUrl: string; storageKey: string; headers: Record<string, string> }>(
        '/api/uploads/sign',
        { method: 'POST', body: { projectId, contentType, size: file.size } },
      );
      await putWithProgress(signed.uploadUrl, file, signed.headers, (progress) => setPhase({ kind: 'uploading', progress }));
      setPhase({ kind: 'finishing' });
      await api(`/api/projects/${projectId}/assets`, {
        method: 'POST',
        body: { storageKey: signed.storageKey, width, height },
      });
      setPhase({ kind: 'idle' });
      router.refresh();
    } catch (err) {
      setPhase({ kind: 'error', message: err instanceof Error ? err.message : 'Upload failed.' });
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && !busy) void upload(file);
  }

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upload</h2>
      <div
        role="button"
        tabIndex={0}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !busy && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground transition-colors',
          dragging && 'border-foreground bg-accent',
          busy && 'cursor-wait opacity-70',
        )}
      >
        <span className="font-medium text-foreground">{hasSource ? 'Replace image' : 'Drop your design here'}</span>
        <span>PNG, JPG or WEBP · up to {MAX_UPLOAD_BYTES / 1024 / 1024} MB</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={Object.keys(UPLOAD_TYPES).join(',')}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void upload(file);
        }}
      />
      {phase.kind === 'uploading' && (
        <div className="space-y-1">
          <div className="h-1.5 overflow-hidden rounded bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(phase.progress * 100)}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">Uploading… {Math.round(phase.progress * 100)}%</p>
        </div>
      )}
      {phase.kind === 'finishing' && <p className="text-xs text-muted-foreground">Checking file…</p>}
      {phase.kind === 'error' && <p className="text-xs text-destructive">{phase.message}</p>}
      {hasSource && !busy && (
        <Button variant="outline" size="sm" className="w-full" onClick={() => inputRef.current?.click()}>
          Choose another file
        </Button>
      )}
    </div>
  );
}
