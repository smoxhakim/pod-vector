import sharp from 'sharp';
import { JobError } from '../jobs/errors';
import { isTrueVector } from '../vectorizer/validate';

/** Rendering above this needs more memory than a worker should use (50 MP ≈ 200 MB RGBA). */
const MAX_PNG_PIXELS = 50_000_000;

/** SVG as delivered to print vendors: standalone file with an XML declaration. */
export function prepareSvg(svg: string): string {
  if (!isTrueVector(svg)) throw new JobError('This vector failed the true-vector check and cannot be exported.');
  const body = svg.replace(/^\s*<\?xml[^>]*\?>\s*/, '');
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;
}

/**
 * Renders the vector to a PNG at its own width/height (= source resolution). Anything the
 * SVG doesn't paint stays transparent.
 */
export async function renderPng(svg: string): Promise<{ png: Buffer; width: number; height: number }> {
  const width = Number(svg.match(/<svg[^>]*\swidth="(\d+(?:\.\d+)?)"/)?.[1]);
  const height = Number(svg.match(/<svg[^>]*\sheight="(\d+(?:\.\d+)?)"/)?.[1]);
  if (!width || !height) throw new JobError('The vector has no size information.');
  if (width * height > MAX_PNG_PIXELS) {
    throw new JobError(`PNG export is limited to ${MAX_PNG_PIXELS / 1_000_000} MP for now (this design is ${Math.round((width * height) / 1_000_000)} MP).`);
  }
  // density 72 = 1 SVG user unit per output pixel, i.e. exactly width × height.
  const png = await sharp(Buffer.from(svg), { density: 72, limitInputPixels: false })
    .resize(Math.round(width), Math.round(height), { fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return { png, width: Math.round(width), height: Math.round(height) };
}
