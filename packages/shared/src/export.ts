// Phase 1 exports: the vector as SVG, or rendered to a transparent PNG at source size.
// (PDF/TIFF/EPS land in Phase 2; CMYK/DPI options in Phase 3.)

export const EXPORT_FORMATS = ['svg', 'png'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export interface ExportJobParams {
  format: ExportFormat;
  /** The vector asset being exported — lets the API reuse an identical earlier export. */
  vectorAssetId: string;
}
