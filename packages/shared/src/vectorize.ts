export const VECTORIZE_MODES = ['logo', 'illustration', 'line_art'] as const;
export type VectorizeMode = (typeof VECTORIZE_MODES)[number];

export interface VectorizeParams {
  detailLevel?: number;
  colorCount?: number;
  smoothness?: number;
  cornerSensitivity?: number;
  noiseThreshold?: number;
  minShapeSize?: number;
}

export interface VectorizeJobParams {
  mode: VectorizeMode;
  quality: VectorizeParams;
}
