'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type View = 'vector' | 'cleaned' | 'original';
const LABELS: Record<View, string> = { vector: 'Vector', cleaned: 'No background', original: 'Original' };

const ZOOM_STEPS = [0.25, 0.5, 1, 2] as const;
type Zoom = 'fit' | (typeof ZOOM_STEPS)[number];

interface Props {
  name: string;
  urls: Partial<Record<View, string | null>>;
  /** What to show first. */
  initial: View;
  /** Source pixel size. All views share it (the SVG's width/height are the source's). */
  width: number;
  height: number;
}

/** Leaves breathing room around the artwork in "fit" mode. */
const FIT_PADDING = 48;

/** Center canvas: view toggle + zoom (fit, 25–200%). 100% = one source pixel per CSS pixel. */
export function ArtworkView({ name, urls, initial, width, height }: Props) {
  const available = (['vector', 'cleaned', 'original'] as const).filter((v) => urls[v]);
  const [view, setView] = useState<View>(initial);
  const [zoom, setZoom] = useState<Zoom>('fit');
  const [fitScale, setFitScale] = useState(1);
  const viewportRef = useRef<HTMLDivElement>(null);

  // A finished job changes what's worth showing (e.g. the fresh vector) — follow it.
  useEffect(() => setView(initial), [initial, urls.vector, urls.cleaned]);

  // Track the viewport size to compute the "fit" scale.
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth - FIT_PADDING * 2;
      const h = el.clientHeight - FIT_PADDING * 2;
      setFitScale(Math.max(0.01, Math.min(w / width, h / height)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [width, height]);

  const scale = zoom === 'fit' ? fitScale : zoom;

  // Keep the point at the centre of the viewport in place when the scale changes.
  const centerRef = useRef({ x: 0.5, y: 0.5 });
  const rememberCenter = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    centerRef.current = {
      x: el.scrollWidth > el.clientWidth ? (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth : 0.5,
      y: el.scrollHeight > el.clientHeight ? (el.scrollTop + el.clientHeight / 2) / el.scrollHeight : 0.5,
    };
  }, []);
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    el.scrollLeft = centerRef.current.x * el.scrollWidth - el.clientWidth / 2;
    el.scrollTop = centerRef.current.y * el.scrollHeight - el.clientHeight / 2;
  }, [scale]);

  const step = useCallback(
    (dir: 1 | -1) => {
      setZoom(() => {
        // Step from the current effective scale to the next preset in that direction.
        const next = dir > 0 ? ZOOM_STEPS.find((z) => z > scale + 1e-6) : [...ZOOM_STEPS].reverse().find((z) => z < scale - 1e-6);
        return next ?? (dir > 0 ? ZOOM_STEPS[ZOOM_STEPS.length - 1] : ZOOM_STEPS[0]);
      });
    },
    [scale],
  );

  // Keyboard: + / - to step, 0 = fit, 1 = 100%. Ignored while typing in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || target.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === '+' || e.key === '=') step(1);
      else if (e.key === '-' || e.key === '_') step(-1);
      else if (e.key === '0') setZoom('fit');
      else if (e.key === '1') setZoom(1);
      else return;
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  const shown = urls[view] ? view : available[0];

  if (!shown) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="rounded-md bg-background/90 px-4 py-2 text-sm text-muted-foreground">Upload a design to get started.</p>
      </div>
    );
  }

  const percent = Math.round(scale * 100);
  // Show real pixels when magnifying a raster; the vector stays sharp at any zoom.
  const pixelated = shown !== 'vector' && scale >= 2;

  return (
    <div className="relative h-full">
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

      {/* flex + m-auto: centred when smaller than the viewport, scrollable when larger. */}
      <div ref={viewportRef} onScroll={rememberCenter} className="flex h-full overflow-auto" data-testid="artwork-viewport">
        {/* Signed R2 URLs: plain <img> so bytes never go through the Next image optimizer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={urls[shown]!}
          src={urls[shown]!}
          alt={`${name}: ${LABELS[shown]}`}
          draggable={false}
          className="m-auto max-w-none shrink-0 shadow-sm"
          style={{
            width: Math.round(width * scale),
            height: Math.round(height * scale),
            imageRendering: pixelated ? 'pixelated' : undefined,
          }}
        />
      </div>

      <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-md border bg-background p-0.5 text-xs shadow-sm">
        <button
          onClick={() => step(-1)}
          disabled={scale <= ZOOM_STEPS[0] + 1e-6}
          className="rounded px-2 py-1 text-muted-foreground hover:bg-accent disabled:opacity-40"
          aria-label="Zoom out"
          title="Zoom out (−)"
        >
          −
        </button>
        <button
          onClick={() => setZoom('fit')}
          className={cn('rounded px-2 py-1', zoom === 'fit' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent')}
          title="Fit to screen (0)"
        >
          Fit
        </button>
        {ZOOM_STEPS.map((z) => (
          <button
            key={z}
            onClick={() => setZoom(z)}
            className={cn('rounded px-2 py-1 tabular-nums', zoom === z ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent')}
            title={z === 1 ? 'Actual size (1)' : undefined}
          >
            {z * 100}%
          </button>
        ))}
        <button
          onClick={() => step(1)}
          disabled={scale >= ZOOM_STEPS[ZOOM_STEPS.length - 1] - 1e-6}
          className="rounded px-2 py-1 text-muted-foreground hover:bg-accent disabled:opacity-40"
          aria-label="Zoom in"
          title="Zoom in (+)"
        >
          +
        </button>
        <span className="min-w-[3.5rem] border-l px-2 text-center tabular-nums text-muted-foreground" aria-live="polite">
          {percent}%
        </span>
      </div>
    </div>
  );
}
