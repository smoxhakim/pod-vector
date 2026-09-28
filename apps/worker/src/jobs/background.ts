import { randomUUID } from 'node:crypto';
import { prisma } from '@pod-vector-studio/db';
import {
  DEFAULT_BACKGROUND_TOLERANCE,
  projectStoragePrefix,
  sniffImageFormat,
  type BackgroundJobParams,
  type BackgroundSettings,
} from '@pod-vector-studio/shared';
import { deleteObject, getObjectBytes, putObject } from '@pod-vector-studio/shared/storage';
import { decode, detectBackground, parseHex, removeColor } from '../background/remove';
import { toHex } from '../vectorizer/color';
import { JobError } from './errors';
import { settleProjectStatus } from './project-status';
import type { JobHandler } from './run-job';

/** Refuse results that would wipe out (almost) the whole design. */
const MAX_REMOVED_SHARE = 0.97;

/**
 * Source image → "cleaned" PNG with the background made transparent, stored on the same
 * version. Always works from the original source, so re-running with other settings
 * replaces the previous result instead of compounding it.
 */
export const backgroundHandler: JobHandler<BackgroundJobParams> = async ({ projectId, versionId, params }, job) => {
  if (!versionId) throw new JobError('No project version to process.');
  const version = await prisma.projectVersion.findFirst({
    where: { id: versionId, projectId },
    include: {
      project: { select: { userId: true } },
      assets: { where: { type: 'source' }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  const source = version?.assets[0];
  if (!version || !source) throw new JobError('Upload an image first.');

  await prisma.project.update({ where: { id: projectId }, data: { status: 'processing' } });
  try {
    const bytes = Buffer.from(await getObjectBytes(source.storageKey));
    if (sniffImageFormat(bytes) !== source.format) throw new JobError('The source file is not a valid image.');
    const raw = await decode(bytes);
    await job.updateProgress(20);

    let color = params.color ? parseHex(params.color) : null;
    if (params.method === 'auto') {
      const detected = detectBackground(raw);
      if (detected.kind === 'transparent') {
        const settings: BackgroundSettings = { method: 'auto', outcome: 'already_transparent' };
        await prisma.projectVersion.update({ where: { id: versionId }, data: { backgroundSettings: { ...settings } } });
        return {};
      }
      if (detected.kind === 'none') {
        throw new JobError("Couldn't find a single background colour. Pick the background colour manually.");
      }
      color = detected.color;
    }
    if (!color) throw new JobError('Pick a background colour.');

    const tolerance = params.tolerance ?? DEFAULT_BACKGROUND_TOLERANCE;
    const contiguous = params.contiguous ?? true;
    const result = await removeColor(raw, { color, tolerance, contiguous });
    await job.updateProgress(80);

    if (result.removedShare === 0) throw new JobError(`No background matching ${toHex(color)} was found.`);
    if (result.removedShare > MAX_REMOVED_SHARE) {
      throw new JobError('That would remove almost the whole image. Lower the tolerance or pick a different colour.');
    }

    const storageKey = `${projectStoragePrefix(version.project.userId, projectId)}cleaned/${randomUUID()}.png`;
    await putObject(storageKey, result.png, 'image/png');

    const settings: BackgroundSettings = {
      method: params.method,
      outcome: 'removed',
      color: toHex(color),
      tolerance,
      contiguous,
      removedShare: Math.round(result.removedShare * 1000) / 1000,
    };
    const superseded = await prisma.asset.findMany({ where: { versionId, type: 'cleaned' }, select: { id: true, storageKey: true } });
    const asset = await prisma.$transaction(async (tx) => {
      await tx.asset.deleteMany({ where: { id: { in: superseded.map((a) => a.id) } } });
      const created = await tx.asset.create({
        data: {
          projectId,
          versionId,
          type: 'cleaned',
          format: 'png',
          storageKey,
          width: result.width,
          height: result.height,
          colorMode: 'rgb',
          fileSizeBytes: result.png.length,
        },
      });
      await tx.projectVersion.update({ where: { id: versionId }, data: { backgroundSettings: { ...settings } } });
      return created;
    });
    await Promise.all(superseded.map((a) => deleteObject(a.storageKey).catch(() => {})));
    console.log(`[background] ${projectId}: removed ${settings.color} (${(result.removedShare * 100).toFixed(1)}% of pixels)`);
    return { resultAssetId: asset.id };
  } finally {
    await settleProjectStatus(projectId, versionId);
  }
};
