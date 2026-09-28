import { randomUUID } from 'node:crypto';
import { prisma } from '@pod-vector-studio/db';
import { projectStoragePrefix, type ExportJobParams } from '@pod-vector-studio/shared';
import { getObjectBytes, putObject } from '@pod-vector-studio/shared/storage';
import { prepareSvg, renderPng } from '../export/render';
import { JobError } from './errors';
import type { JobHandler } from './run-job';

/** Vector asset → final_export asset (SVG as-is after re-validation, or PNG at source size). */
export const exportHandler: JobHandler<ExportJobParams> = async ({ projectId, versionId, params }) => {
  const vector = await prisma.asset.findFirst({
    where: { id: params.vectorAssetId, projectId, type: 'vector' },
    include: { project: { select: { userId: true } } },
  });
  if (!vector || vector.versionId !== versionId) throw new JobError('The vector to export no longer exists. Vectorize again.');

  const svg = Buffer.from(await getObjectBytes(vector.storageKey)).toString('utf8');
  const prefix = `${projectStoragePrefix(vector.project.userId, projectId)}exports/${randomUUID()}`;

  let body: Buffer;
  let width = vector.width;
  let height = vector.height;
  if (params.format === 'svg') {
    body = Buffer.from(prepareSvg(svg), 'utf8');
  } else if (params.format === 'png') {
    prepareSvg(svg); // same true-vector gate before rendering
    const rendered = await renderPng(svg);
    body = rendered.png;
    width = rendered.width;
    height = rendered.height;
  } else {
    throw new JobError(`Export format "${params.format}" is not available yet.`);
  }

  const storageKey = `${prefix}.${params.format}`;
  await putObject(storageKey, body, params.format === 'svg' ? 'image/svg+xml' : 'image/png');
  const asset = await prisma.asset.create({
    data: {
      projectId,
      versionId: vector.versionId,
      type: 'final_export',
      format: params.format,
      storageKey,
      width,
      height,
      colorMode: 'rgb',
      fileSizeBytes: body.length,
      isTrueVector: params.format === 'svg' ? true : null,
    },
  });
  console.log(`[export] ${projectId}: ${params.format} ${width}×${height}, ${body.length} bytes`);
  return { resultAssetId: asset.id };
};
