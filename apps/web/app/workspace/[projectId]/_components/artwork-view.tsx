'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

type View = 'vector' | 'original';

/** Center canvas. Phase 1.8 adds zoom and the before/after slider. */
export function ArtworkView({ name, sourceUrl, vectorUrl }: { name: string; sourceUrl: string | null; vectorUrl: string | null }) {
  const [view, setView] = useState<View>('vector');
  const shown = view === 'vector' && vectorUrl ? vectorUrl : sourceUrl;

  if (!shown) {
    return (
      <p className="rounded-md bg-background/90 px-4 py-2 text-sm text-muted-foreground">Upload a design to get started.</p>
    );
  }

  return (
    <>
      {vectorUrl && (
        <div className="absolute left-1/2 top-4 z-10 flex -translate-x-1/2 rounded-md border bg-background p-0.5 text-xs shadow-sm">
          {(['vector', 'original'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn('rounded px-3 py-1 capitalize', view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
            >
              {v}
            </button>
          ))}
        </div>
      )}
      {/* Signed R2 URLs: plain <img> so bytes never go through the Next image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img key={shown} src={shown} alt={`${name} ${view}`} className="max-h-full max-w-full object-contain shadow-sm" />
    </>
  );
}
