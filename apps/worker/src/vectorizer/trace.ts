import Jimp from 'jimp';
import { Potrace } from 'potrace';

export interface TraceOptions {
  /** Speckles up to this many px² are dropped. */
  turdSize: number;
  /** Corner threshold: lower keeps more sharp corners, higher rounds them. */
  alphaMax: number;
  /** Curve optimisation tolerance: higher = fewer nodes. */
  optTolerance: number;
}

/** Traces a binary mask (1 = inside) into an SVG path `d` string via potrace. */
export function traceMask(mask: Uint8Array, width: number, height: number, opts: TraceOptions): Promise<string> {
  const data = Buffer.alloc(width * height * 4, 255);
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 0;
  }
  const potrace = new Potrace({ threshold: 128, ...opts });
  return new Promise((resolve, reject) => {
    potrace.loadImage(new Jimp({ data, width, height }), (err) => {
      if (err) return reject(err);
      const match = potrace.getPathTag('#000').match(/ d="([^"]*)"/);
      resolve(match ? match[1].trim() : '');
    });
  });
}

/** Rescales and rounds every number in a path to 2 decimals (smaller files, same shape). */
export function scalePath(d: string, factor: number): string {
  return d.replace(/-?\d+(?:\.\d+)?/g, (m) => String(Math.round(parseFloat(m) * factor * 100) / 100));
}
