export const VECTORIZE_MODES = ['logo', 'illustration', 'line_art'] as const;
export type VectorizeMode = (typeof VECTORIZE_MODES)[number];

/** Only Logo mode ships in Phase 1; the others land in Phase 2. */
export const AVAILABLE_VECTORIZE_MODES: readonly VectorizeMode[] = ['logo'];

/** Quality controls. All optional; the engine picks sensible defaults per mode. */
export interface VectorizeParams {
  /** 0–1: higher keeps subtler colour differences apart. Default 0.5. */
  detailLevel?: number;
  /** 1–16: maximum number of output colours. Default 8 (auto-detected up to this). */
  colorCount?: number;
  /** 0–1: higher = smoother curves with fewer nodes. Default ~0.33. */
  smoothness?: number;
  /** 0–1: higher keeps more sharp corners. Default ~0.25. */
  cornerSensitivity?: number;
  /** 0–1: higher drops more small/rare colours as noise. Default ~0.08. */
  noiseThreshold?: number;
  /** Shapes smaller than this many px² (source pixels) are dropped. Default 4. */
  minShapeSize?: number;
}

export interface VectorizeJobParams {
  mode: VectorizeMode;
  quality: VectorizeParams;
}
