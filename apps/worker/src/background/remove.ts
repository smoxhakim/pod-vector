// Colour-key background removal with soft, decontaminated edges.

import sharp from 'sharp';
import { JobError } from '../jobs/errors';
import { deltaE, toLab, type RGB } from '../vectorizer/color';

/** Above this, the raw RGBA buffer gets too big for a worker (50 MP ≈ 200 MB). */
const MAX_PIXELS = 50_000_000;
/** Border ring used for detection, in px. */
const RING = 2;

export type Detection = { kind: 'transparent' } | { kind: 'solid'; color: RGB } | { kind: 'none' };

export interface RemovalOptions {
  color: RGB;
  /** 0–100 (UI scale). */
  tolerance: number;
  contiguous: boolean;
}

export interface RemovalResult {
  png: Buffer;
  width: number;
  height: number;
  removedShare: number;
}

interface Raw {
  data: Buffer;
  width: number;
  height: number;
}

export async function decode(image: Buffer): Promise<Raw> {
  const meta = await sharp(image).metadata();
  if (!meta.width || !meta.height) throw new JobError('Could not read the image.');
  if (meta.width * meta.height > MAX_PIXELS) {
    throw new JobError(`Image is too large for background removal (max ${MAX_PIXELS / 1_000_000} MP).`);
  }
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * Looks at the outer ring of pixels: mostly transparent → already transparent; one colour
 * covering most of the ring → that's the background; otherwise no uniform background.
 */
export function detectBackground({ data, width, height }: Raw): Detection {
  const ring: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < RING || y < RING || x >= width - RING || y >= height - RING) ring.push(y * width + x);
      else if (x === RING) x = width - RING - 1; // skip the interior of this row
    }
  }
  const opaque = ring.filter((i) => data[i * 4 + 3] >= 128);
  if (opaque.length < ring.length * 0.5) return { kind: 'transparent' };

  // Most common colour (coarse buckets absorb JPEG noise), then everything close to it.
  const buckets = new Map<number, number>();
  for (const i of opaque) {
    const key = ((data[i * 4] >> 3) << 10) | ((data[i * 4 + 1] >> 3) << 5) | (data[i * 4 + 2] >> 3);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const topKey = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const seed: RGB = [((topKey >> 10) << 3) + 4, (((topKey >> 5) & 31) << 3) + 4, ((topKey & 31) << 3) + 4];
  const seedLab = toLab(seed);
  const matches = opaque.filter((i) => deltaE(toLab(rgbAt(data, i)), seedLab) < 10);
  if (matches.length < opaque.length * 0.7) return { kind: 'none' };

  const mean = [0, 1, 2].map((c) => Math.round(matches.reduce((s, i) => s + data[i * 4 + c], 0) / matches.length));
  return { kind: 'solid', color: mean as RGB };
}

/**
 * 1. Background = pixels within `hard` ΔE of the key colour (only those connected to the
 *    border when `contiguous`).
 * 2. Edge pixels (within 2px of the background) are anti-aliasing blends of background and
 *    design colour F. F is taken from the most design-like neighbour; alpha is the pixel's
 *    projection onto the key→F line in RGB (exact for linear blends), and the pixel's colour
 *    becomes F. That removes the light/dark halo a plain colour key leaves on dark shirts.
 */
export async function removeColor(raw: Raw, opts: RemovalOptions): Promise<RemovalResult> {
  const { width, height } = raw;
  const data = Buffer.from(raw.data);
  const n = width * height;
  const hard = 2 + opts.tolerance * 0.5; // ΔE; tolerance 20 → 12
  const key = opts.color;
  const keyLab = toLab(key);

  // Distance per distinct colour is cached: logos have few colours, photos reuse many.
  const cache = new Map<number, number>();
  const dist = (i: number) => {
    const k = (data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2];
    let d = cache.get(k);
    if (d === undefined) {
      d = deltaE(toLab(rgbAt(data, i)), keyLab);
      if (cache.size < 200_000) cache.set(k, d);
    }
    return d;
  };
  const isKeyed = (i: number) => data[i * 4 + 3] < 8 || dist(i) < hard;

  const bg = new Uint8Array(n);
  if (opts.contiguous) {
    const stack: number[] = [];
    const push = (i: number) => {
      if (!bg[i] && isKeyed(i)) {
        bg[i] = 1;
        stack.push(i);
      }
    };
    for (let x = 0; x < width; x++) {
      push(x);
      push((height - 1) * width + x);
    }
    for (let y = 0; y < height; y++) {
      push(y * width);
      push(y * width + width - 1);
    }
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % width;
      if (x > 0) push(i - 1);
      if (x < width - 1) push(i + 1);
      if (i >= width) push(i - width);
      if (i < n - width) push(i + width);
    }
  } else {
    for (let i = 0; i < n; i++) if (isKeyed(i)) bg[i] = 1;
  }

  // Edge pixels: not background, but within 2px of it.
  const R = 2;
  const edge = new Uint8Array(n);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!bg[i]) continue;
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          const j = yy * width + xx;
          if (!bg[j]) edge[j] = 1;
        }
      }
    }
  }

  const out = Buffer.from(data);
  let removed = 0;
  for (let i = 0; i < n; i++) {
    if (bg[i]) {
      out[i * 4 + 3] = 0;
      removed++;
      continue;
    }
    if (!edge[i]) continue;

    // F = the most design-like (furthest from key) non-background neighbour, incl. itself.
    const x = i % width;
    const y = (i - x) / width;
    let f = i;
    let fDist = dist(i);
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        const j = yy * width + xx;
        if (bg[j] || data[j * 4 + 3] < 128) continue;
        const d = dist(j);
        if (d > fDist) {
          fDist = d;
          f = j;
        }
      }
    }
    const F = rgbAt(data, f);
    const C = rgbAt(data, i);
    const kf = [F[0] - key[0], F[1] - key[1], F[2] - key[2]];
    const len2 = kf[0] ** 2 + kf[1] ** 2 + kf[2] ** 2;
    if (len2 < 1) continue;
    const a = Math.max(0, Math.min(1, ((C[0] - key[0]) * kf[0] + (C[1] - key[1]) * kf[1] + (C[2] - key[2]) * kf[2]) / len2));
    if (a > 0.98) continue;
    out[i * 4] = F[0];
    out[i * 4 + 1] = F[1];
    out[i * 4 + 2] = F[2];
    out[i * 4 + 3] = Math.round(data[i * 4 + 3] * a);
    if (a < 0.5) removed++;
  }

  const png = await sharp(out, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
  return { png, width, height, removedShare: removed / n };
}

export function parseHex(hex: string): RGB {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
}

function rgbAt(data: Buffer, i: number): RGB {
  return [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
}
