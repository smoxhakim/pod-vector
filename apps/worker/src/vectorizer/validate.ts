// "True vector" check: the output must be real geometry, never a raster wrapped in SVG.

export interface SvgInspection {
  /** Number of geometry elements (path, polygon, circle, …). */
  shapeCount: number;
  /** <image>, data:image URIs or <foreignObject> — any way of smuggling pixels in. */
  embedsRaster: boolean;
}

const SHAPE_TAGS = /<(path|polygon|polyline|circle|ellipse|rect|line)\b[^>]*>/gi;
const RASTER_PATTERNS = [/<image\b/i, /<feImage\b/i, /<foreignObject\b/i, /data:image\//i];

export function inspectSvg(svg: string): SvgInspection {
  const shapes = svg.match(SHAPE_TAGS) ?? [];
  // A path with an empty d has no geometry.
  const shapeCount = shapes.filter((tag) => !/^<path\b/i.test(tag) || /\sd="[^"]*\d/.test(tag)).length;
  return { shapeCount, embedsRaster: RASTER_PATTERNS.some((re) => re.test(svg)) };
}

export function isTrueVector(svg: string): boolean {
  const { shapeCount, embedsRaster } = inspectSvg(svg);
  return shapeCount > 0 && !embedsRaster;
}
