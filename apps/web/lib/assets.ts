import { prisma, type Asset } from '@pod-vector-studio/db';

/** JSON shape for asset metadata. */
export interface AssetDTO {
  id: string;
  projectId: string;
  versionId: string;
  type: Asset['type'];
  format: Asset['format'];
  width: number | null;
  height: number | null;
  dpi: number | null;
  colorMode: string | null;
  fileSizeBytes: number | null;
  isTrueVector: boolean | null;
  createdAt: string;
}

export function toAssetDTO(a: Asset): AssetDTO {
  return {
    id: a.id,
    projectId: a.projectId,
    versionId: a.versionId,
    type: a.type,
    format: a.format,
    width: a.width,
    height: a.height,
    dpi: a.dpi,
    colorMode: a.colorMode,
    fileSizeBytes: a.fileSizeBytes,
    isTrueVector: a.isTrueVector,
    createdAt: a.createdAt.toISOString(),
  };
}

/** Asset only if its project belongs to the user — callers respond 404 otherwise. */
export function getOwnedAsset(assetId: string, userId: string) {
  return prisma.asset.findFirst({
    where: { id: assetId, project: { userId } },
    include: { project: { select: { name: true } } },
  });
}

const FILENAME_SUFFIX: Record<Asset['type'], string> = {
  source: '-original',
  cleaned: '-no-background',
  vector: '-vector',
  cmyk_preview: '-cmyk-preview',
  editor_export: '-edited',
  final_export: '',
};

/** Filesystem-safe download name, e.g. "Moroccan Eagle T-Shirt.png" or "… -no-background.png". */
export function downloadFilename(projectName: string, asset: Pick<Asset, 'type' | 'format'>): string {
  const base = projectName.replace(/[^\w\- ]+/g, '').trim().slice(0, 80) || 'design';
  return `${base}${FILENAME_SUFFIX[asset.type]}.${asset.format}`;
}
