'use client';

import { DEFAULT_BACKGROUND_TOLERANCE, type BackgroundSettings } from '@pod-vector-studio/shared';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useStartJob } from '@/lib/use-job';

interface Props {
  projectId: string;
  hasSource: boolean;
  hasCleaned: boolean;
  settings: BackgroundSettings | null;
  activeJobId: string | null;
}

// Chromium's EyeDropper API (picks any on-screen pixel). Elsewhere the native colour input suffices.
type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

export function BackgroundPanel({ projectId, hasSource, hasCleaned, settings, activeJobId }: Props) {
  const { start, running, error } = useStartJob(`/api/projects/${projectId}/remove-background`, activeJobId);
  const [manual, setManual] = useState(false);
  const [color, setColor] = useState(settings?.color ?? '#ffffff');
  const [tolerance, setTolerance] = useState(settings?.tolerance ?? DEFAULT_BACKGROUND_TOLERANCE);
  const [enclosed, setEnclosed] = useState(settings?.contiguous === false);
  const [eyeDropper, setEyeDropper] = useState<EyeDropperCtor | null>(null);

  useEffect(() => {
    const ctor = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;
    if (ctor) setEyeDropper(() => ctor);
  }, []);

  async function pickFromScreen() {
    if (!eyeDropper) return;
    try {
      setColor((await new eyeDropper().open()).sRGBHex);
    } catch {
      // user pressed Esc
    }
  }

  const disabled = !hasSource || running;

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Background</h2>

      {settings?.outcome === 'already_transparent' && (
        <p className="text-xs text-emerald-700">Already transparent — nothing to remove.</p>
      )}
      {settings?.outcome === 'removed' && hasCleaned && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block h-3.5 w-3.5 rounded border" style={{ background: settings.color }} />
          Removed {settings.color} ({Math.round((settings.removedShare ?? 0) * 100)}% of the image)
        </p>
      )}

      <Button
        variant="outline"
        className="w-full"
        disabled={disabled}
        onClick={() => start({ method: 'auto', contiguous: !enclosed })}
      >
        {running ? 'Removing…' : 'Remove background'}
      </Button>

      <button
        type="button"
        className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        onClick={() => setManual((m) => !m)}
      >
        {manual ? 'Hide options' : 'Pick colour / options'}
      </button>

      {manual && (
        <div className="space-y-3 rounded-md border p-3">
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Background colour"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-8 w-10 cursor-pointer rounded border bg-transparent"
            />
            <span className="font-mono text-xs">{color}</span>
            {eyeDropper && (
              <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={pickFromScreen}>
                Pick from image
              </Button>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="bg-tolerance" className="text-xs">
              Tolerance: {tolerance}
            </Label>
            <input
              id="bg-tolerance"
              type="range"
              min={0}
              max={100}
              value={tolerance}
              onChange={(e) => setTolerance(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" checked={enclosed} onChange={(e) => setEnclosed(e.target.checked)} className="mt-0.5" />
            <span>
              Also remove enclosed areas
              <span className="block text-muted-foreground">e.g. inside letters. Off keeps white parts of the design.</span>
            </span>
          </label>
          <Button
            size="sm"
            className="w-full"
            disabled={disabled}
            onClick={() => start({ method: 'color', color, tolerance, contiguous: !enclosed })}
          >
            Remove this colour
          </Button>
        </div>
      )}

      {hasCleaned && !running && (
        <button
          type="button"
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => start({ method: 'none' })}
        >
          Restore original background
        </button>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
