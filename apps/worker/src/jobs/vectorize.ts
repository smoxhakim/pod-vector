import { randomUUID } from 'node:crypto';
import { prisma } from '@pod-vector-studio/db';
import { projectStoragePrefix, sniffImageFormat, type VectorizeJobParams } from '@pod-vector-studio/shared';
import { getObjectBytes, putObject } from '@pod-vector-studio/shared/storage';
import { PotraceVectorizerEngine, VectorizeError, type VectorizerEngine } from '../vectorizer/engine';
import { inspectSvg } from '../vectorizer/validate';
import { settleProjectStatus } from './project-status';
import type { JobHandler } from './run-job';

const engine: VectorizerEngine = new PotraceVectorizerEngine();

/**
 * Source asset of the version → vector SVG asset on the same version.
 * Never stores anything that fails the true-vector check.
 */
export const vectorizeHandler: JobHandler<VectorizeJobParams> = async ({ projectId, versionId, params }, job) => {
  if (!versionId) throw new VectorizeError('No project version to vectorize.');

  const version = await prisma.projectVersion.findFirst({
    where: { id: versionId, projectId },
    include: {
      project: { select: { userId: true } },
      assets: { where: { type: { in: ['source', 'cleaned'] } }, orderBy: { createdAt: 'desc' } },
    },
  });
  // Trace the background-removed image when there is one, else the original upload.
  const input = version?.assets.find((a) => a.type === 'cleaned') ?? version?.assets.find((a) => a.type === 'source');
  if (!version || !input) throw new VectorizeError('Upload an image before vectorizing.');

  await prisma.project.update({ where: { id: projectId }, data: { status: 'processing' } });
  try {
    const bytes = Buffer.from(await getObjectBytes(input.storageKey));
    // Re-validate the signature: never trust what the browser said it uploaded.
    if (sniffImageFormat(bytes) !== input.format) throw new VectorizeError('The source file is not a valid image.');
    await job.updateProgress(10);

    const result = await engine.vectorize(bytes, params.mode, params.quality ?? {});
    await job.updateProgress(80);

    const inspection = inspectSvg(result.svg);
    if (inspection.embedsRaster || inspection.shapeCount === 0) {
      // Honest failure beats a "vector" that is really pixels (PRD: true vectorization only).
      throw new VectorizeError('No vector shapes could be extracted from this image.');
    }

    const storageKey = `${projectStoragePrefix(version.project.userId, projectId)}vector/${randomUUID()}.svg`;
    await putObject(storageKey, result.svg, 'image/svg+xml');

    const asset = await prisma.$transaction(async (tx) => {
      const created = await tx.asset.create({
        data: {
          projectId,
          versionId,
          type: 'vector',
          format: 'svg',
          storageKey,
          width: result.width,
          height: result.height,
          colorMode: 'rgb',
          fileSizeBytes: Buffer.byteLength(result.svg),
          isTrueVector: true,
        },
      });
      await tx.projectVersion.update({
        where: { id: versionId },
        // inputAssetId lets the UI tell when the vector is stale (background changed since).
        data: { vectorizationSettings: { mode: params.mode, ...(params.quality ?? {}), inputAssetId: input.id } },
      });
      await tx.project.update({ where: { id: projectId }, data: { status: 'ready' } });
      return created;
    });
    console.log(
      `[vectorize] ${projectId}: ${result.colors.length} colours (${result.colors.join(' ')}), ${inspection.shapeCount} paths, ${Buffer.byteLength(result.svg)} bytes`,
    );
    return { resultAssetId: asset.id };
  } catch (err) {
    await settleProjectStatus(projectId, versionId);
    throw err;
  }
};
