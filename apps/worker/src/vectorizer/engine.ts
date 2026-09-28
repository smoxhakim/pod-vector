// VectorizerEngine abstraction: raster -> true vector paths (not embedded raster).

import type { VectorizeMode, VectorizeParams } from '@pod-vector-studio/shared';
import sharp from 'sharp';
import { JobError } from '../jobs/errors';
import { toHex } from './color';
import { segmentColors } from './palette';
import { scalePath, traceMask } from './trace';

export type { VectorizeMode, VectorizeParams };

export interface VectorizeResult {
  svg: string;
  /** Source pixel dimensions (the SVG's width/height/viewBox). */
  width: number;
  height: number;
  colors: string[];
  pathCount: number;
}

export interface VectorizerEngine {
  vectorize(imageBuffer: Buffer, mode: VectorizeMode, params: VectorizeParams): Promise<VectorizeResult>;
}

/** Thrown for problems the user should see verbatim (bad input, unsupported mode). */
export class VectorizeError extends JobError {
  override name = 'VectorizeError';
}

/** Tracing above this resolution adds time and nodes, not visible accuracy. */
const MAX_TRACE_DIMENSION = 3000;

const clamp = (v: number | undefined, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

/**
 * Phase 1: Logo mode. Segments the image into a few flat colours, then traces each colour
 * layer with potrace. Layers are stacked (each mask includes every layer above it), so
 * neighbouring shapes overlap slightly instead of leaving hairline gaps.
 */
export class PotraceVectorizerEngine implements VectorizerEngine {
  async vectorize(imageBuffer: Buffer, mode: VectorizeMode, params: VectorizeParams): Promise<VectorizeResult> {
    if (mode !== 'logo') throw new VectorizeError(`"${mode}" mode is not available yet — use Logo mode.`);

    const meta = await sharp(imageBuffer).metadata();
    if (!meta.width || !meta.height) throw new VectorizeError('Could not read the image dimensions.');
    const { width, height } = meta;
    const lossy = meta.format === 'jpeg';

    // Downscale very large images for tracing; path coordinates are scaled back up.
    const traceScale = Math.min(1, MAX_TRACE_DIMENSION / Math.max(width, height));
    let pipeline = sharp(imageBuffer).ensureAlpha();
    if (traceScale < 1) pipeline = pipeline.resize(Math.round(width * traceScale), Math.round(height * traceScale));
    if (lossy) pipeline = pipeline.median(3); // JPEG ringing would otherwise become extra colours
    const prepared = await pipeline.png().toBuffer();

    const detail = clamp(params.detailLevel, 0, 1, 0.5);
    const segmentation = await segmentColors(prepared, {
      maxColors: Math.round(clamp(params.colorCount, 1, 16, 8)),
      minShare: 0.0005 + clamp(params.noiseThreshold, 0, 1, 0.075) * 0.02,
      mergeDeltaE: (lossy ? 16 : 10) * (1.5 - detail),
      blendDistance: 14,
    });
    if (segmentation.palette.length === 0) throw new VectorizeError('The image is fully transparent — nothing to trace.');

    const trace = {
      turdSize: Math.max(0, clamp(params.minShapeSize, 0, 10_000, 4) * traceScale * traceScale),
      alphaMax: 1.334 * (1 - clamp(params.cornerSensitivity, 0, 1, 0.25)),
      optTolerance: 0.1 + clamp(params.smoothness, 0, 1, 1 / 3) * 0.9,
    };

    const { width: tw, height: th, labels, palette } = segmentation;
    const paths: string[] = [];
    const mask = new Uint8Array(tw * th);
    for (let layer = 0; layer < palette.length; layer++) {
      for (let i = 0; i < mask.length; i++) mask[i] = labels[i] >= layer ? 1 : 0;
      const d = await traceMask(mask, tw, th, trace);
      if (d) paths.push(`<path fill="${toHex(palette[layer])}" fill-rule="evenodd" d="${scalePath(d, 1 / traceScale)}"/>`);
    }

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      paths.join('') +
      `</svg>`;
    return { svg, width, height, colors: palette.map(toHex), pathCount: paths.length };
  }
}

/** Phase 2+ slot: commercial vectorization API-backed implementation. */
export class CommercialApiVectorizerEngine implements VectorizerEngine {
  async vectorize(): Promise<VectorizeResult> {
    throw new Error('Not implemented');
  }
}
