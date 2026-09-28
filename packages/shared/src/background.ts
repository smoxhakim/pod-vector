// Background removal (Phase 1: colour-key). Browser-safe.

export const BACKGROUND_METHODS = ['auto', 'color', 'none'] as const;
export type BackgroundMethod = (typeof BACKGROUND_METHODS)[number];

export interface BackgroundJobParams {
  /** auto = detect a solid colour from the image border; color = use `color`. */
  method: 'auto' | 'color';
  /** #rrggbb, required for method "color". */
  color?: string;
  /** 0–100. How different a pixel may be from the background colour and still be removed. */
  tolerance?: number;
  /** true (default) = only background connected to the image edges; false = every match. */
  contiguous?: boolean;
}

/** Stored on ProjectVersion.backgroundSettings after a run. */
export interface BackgroundSettings {
  method: 'auto' | 'color';
  /** What happened: removed a colour, or the image was already transparent. */
  outcome: 'removed' | 'already_transparent';
  color?: string;
  tolerance?: number;
  contiguous?: boolean;
  /** Share of pixels made transparent, 0–1. */
  removedShare?: number;
}

export const DEFAULT_BACKGROUND_TOLERANCE = 20;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}
