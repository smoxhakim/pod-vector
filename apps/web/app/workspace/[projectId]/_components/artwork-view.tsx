'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type View = 'vector' | 'cleaned' | 'original';
const LABELS: Record<View, string> = { vector: 'Vector', cleaned: 'No background', original: 'Original' };

interface Props {
  name: string;
  urls: Partial<Record<View, string | null>>;
  /** What to show first. */
  initial: View;
}

/** Center canvas. Phase 1.8 adds zoom and the before/after slider. */
export function ArtworkView({ name, urls, initial }: Props) {
  const available = (['vector', 'cleaned', 'original'] as const).filter((v) => urls[v]);
  const [view, setView] = useState<View>(initial);
  // A finished job changes what's worth showing (e.g. the fresh vector) — follow it.
  useEffect(() => setView(initial), [initial, urls.vector, urls.cleaned]);
  const shown = urls[view] ? view : available[0];

  if (!shown) {
    return (
      <p className="rounded-md bg-background/90 px-4 py-2 text-sm text-muted-foreground">Upload a design to get started.</p>
    );
  }

  return (
    <>
      {available.length > 1 && (
        <div className="absolute left-1/2 top-4 z-10 flex -translate-x-1/2 rounded-md border bg-background p-0.5 text-xs shadow-sm">
          {available.map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn('rounded px-3 py-1', shown === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
            >
              {LABELS[v]}
            </button>
          ))}
        </div>
      )}
      {/* Signed R2 URLs: plain <img> so bytes never go through the Next image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img key={urls[shown]!} src={urls[shown]!} alt={`${name}: ${LABELS[shown]}`} className="max-h-full max-w-full object-contain shadow-sm" />
    </>
  );
}
