// Flat-colour segmentation for Logo mode: reduce an image to its few "real" design colours
// and give every opaque pixel a colour label. Anti-aliasing blends and compression noise
// must not become colours of their own, or the trace fills up with slivers.

import sharp from 'sharp';
import { deltaE, segmentDistance, toLab, type Lab, type RGB } from './color';

export interface PaletteOptions {
  /** Upper bound on output colours. */
  maxColors: number;
  /** Colours covering less than this share of opaque pixels are dropped. */
  minShare: number;
  /** Colours closer than this ΔE are merged into the more common one. */
  mergeDeltaE: number;
  /** Max RGB distance from the line between two stronger colours to count as a blend. */
  blendDistance: number;
}

export interface Segmentation {
  width: number;
  height: number;
  /** Per pixel: palette index (0 = bottom of the stack, most area), or -1 for transparent. */
  labels: Int16Array;
  /** Colours ordered bottom → top. */
  palette: RGB[];
}

interface Candidate {
  key: number;
  count: number;
  rgb: RGB;
  lab: Lab;
}

const ALPHA_CUTOFF = 128;

export async function segmentColors(png: Buffer, opts: PaletteOptions): Promise<Segmentation> {
  // libimagequant (via sharp) proposes candidates; we then decide which are real colours.
  const quantized = await sharp(png)
    .png({ palette: true, colours: Math.min(opts.maxColors * 2, 256), dither: 0, effort: 10 })
    .toBuffer();
  const { data, info } = await sharp(quantized).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const n = width * height;
  const keyAt = (i: number) => (data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2];
  const rgbAt = (i: number): RGB => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];

  const counts = new Map<number, number>();
  let opaque = 0;
  for (let i = 0; i < n; i++) {
    if (data[i * 4 + 3] < ALPHA_CUTOFF) continue;
    opaque++;
    const k = keyAt(i);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  if (opaque === 0) return { width, height, labels: new Int16Array(n).fill(-1), palette: [] };

  const candidates: Candidate[] = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => {
      const rgb: RGB = [(key >> 16) & 255, (key >> 8) & 255, key & 255];
      return { key, count, rgb, lab: toLab(rgb) };
    });

  // Most common first: merge near-duplicates, reject blends of two stronger colours.
  const kept: Candidate[] = [];
  for (const cand of candidates) {
    const twin = kept.find((k) => deltaE(k.lab, cand.lab) < opts.mergeDeltaE);
    if (twin) {
      twin.count += cand.count;
      continue;
    }
    if (isBlend(cand.rgb, kept, opts.blendDistance)) continue;
    kept.push({ ...cand });
  }
  const palette = kept.filter((k) => k.count / opaque >= opts.minShare).slice(0, opts.maxColors);
  const paletteLab = palette.map((p) => p.lab);

  // Label pixels whose quantized colour maps cleanly onto a palette colour; the rest (-2)
  // are edge blends/noise and get decided by their neighbourhood.
  const direct = new Map<number, number>();
  for (const cand of candidates) direct.set(cand.key, palette.findIndex((p) => deltaE(p.lab, cand.lab) < opts.mergeDeltaE / 2));
  const labels = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    labels[i] = data[i * 4 + 3] < ALPHA_CUTOFF ? -1 : (direct.get(keyAt(i)) ?? -1) >= 0 ? direct.get(keyAt(i))! : -2;
  }
  resolveFromNeighbours(labels, width, height, (i) => toLab(rgbAt(i)), paletteLab);

  // Stack order: largest area at the bottom. Rendering is correct for any order (each
  // layer's mask includes everything above it); this order just gives the cleanest shapes.
  const area = new Array(palette.length).fill(0);
  for (let i = 0; i < n; i++) if (labels[i] >= 0) area[labels[i]]++;
  const order = palette.map((_, j) => j).sort((a, b) => area[b] - area[a]);
  const rank = new Int16Array(palette.length);
  order.forEach((j, r) => (rank[j] = r));
  for (let i = 0; i < n; i++) if (labels[i] >= 0) labels[i] = rank[labels[i]];

  return { width, height, labels, palette: order.map((j) => palette[j].rgb) };
}

function isBlend(c: RGB, kept: Candidate[], maxDistance: number): boolean {
  for (let a = 0; a < kept.length; a++) {
    for (let b = a + 1; b < kept.length; b++) {
      // Anti-aliasing mixes in gamma-encoded RGB, so the blend lies on the RGB segment.
      const { distance, t } = segmentDistance(c, kept[a].rgb, kept[b].rgb);
      if (distance < maxDistance && t > 0.08 && t < 0.92) return true;
    }
  }
  return false;
}

/** Unlabelled (-2) pixels adopt the perceptually closest label among their 8 neighbours. */
function resolveFromNeighbours(
  labels: Int16Array,
  width: number,
  height: number,
  labAt: (i: number) => Lab,
  palette: Lab[],
) {
  for (let pass = 0; pass < 8; pass++) {
    let unresolved = 0;
    const next = labels.slice();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (labels[i] !== -2) continue;
        const me = labAt(i);
        let best = -2;
        let bestDist = Infinity;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
            const l = labels[yy * width + xx];
            if (l < 0) continue;
            const d = deltaE(me, palette[l]);
            if (d < bestDist) {
              bestDist = d;
              best = l;
            }
          }
        }
        if (best === -2) unresolved++;
        next[i] = best;
      }
    }
    labels.set(next);
    if (!unresolved) return;
  }
  // Isolated leftovers (no labelled neighbours after 8 passes): nearest palette colour.
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] !== -2) continue;
    const me = labAt(i);
    labels[i] = palette.reduce((best, p, j) => (deltaE(me, p) < deltaE(me, palette[best]) ? j : best), 0);
  }
}
