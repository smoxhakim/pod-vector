// VectorizerEngine abstraction: raster -> true vector paths (not embedded raster).

import type { VectorizeMode, VectorizeParams } from '@pod-vector-studio/shared';

export type { VectorizeMode, VectorizeParams };

export interface VectorizerEngine {
  vectorize(imageBuffer: Buffer, mode: VectorizeMode, params: VectorizeParams): Promise<string>; // returns SVG markup
}

/** Phase 1: Potrace/ImageTracer-backed implementation, Simple/Logo mode only. */
export class PotraceVectorizerEngine implements VectorizerEngine {
  async vectorize(_imageBuffer: Buffer, _mode: VectorizeMode, _params: VectorizeParams): Promise<string> {
    // TODO (Phase 1.6): mode === 'logo' -> potrace trace with limited palette.
    // TODO (Phase 2): 'illustration' -> color-layer separation; 'line_art' -> stroke-preserving trace.
    throw new Error('Not implemented');
  }
}

/** Phase 2+ slot: commercial vectorization API-backed implementation. */
export class CommercialApiVectorizerEngine implements VectorizerEngine {
  async vectorize(_imageBuffer: Buffer, _mode: VectorizeMode, _params: VectorizeParams): Promise<string> {
    throw new Error('Not implemented');
  }
}

/**
 * Validates that generated SVG contains real path/shape geometry rather than
 * an embedded raster <image> tag (the "fake vectorization" failure mode).
 */
export function isTrueVector(svgMarkup: string): boolean {
  // TODO (Phase 1.6): parse the SVG properly instead of regex.
  const hasEmbeddedImage = /<image\b/i.test(svgMarkup);
  const hasVectorShapes = /<(path|polygon|polyline|circle|rect|line)\b/i.test(svgMarkup);
  return hasVectorShapes && !hasEmbeddedImage;
}
