import { Prisma, prisma } from '@pod-vector-studio/db';
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_DIMENSION,
  MIN_UPLOAD_DIMENSION,
  SNIFF_BYTES,
  projectStoragePrefix,
  sniffImageFormat,
} from '@pod-vector-studio/shared';
import { deleteObject, headObject, readObjectStart } from '@pod-vector-studio/shared/storage';
import { NextResponse, type NextRequest } from 'next/server';
import { toAssetDTO } from '@/lib/assets';
import { getSessionUserId, unauthorized } from '@/lib/auth';
import { badRequest, notFound, readJson } from '@/lib/http';
import { getOwnedProject } from '@/lib/projects';

interface Params {
  params: { id: string };
}

const KEY_PATTERN = /^source\/[0-9a-f-]{36}\.(png|jpg|webp)$/;

function isDimension(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= MIN_UPLOAD_DIMENSION && v <= MAX_UPLOAD_DIMENSION;
}

// POST /api/projects/:id/assets { storageKey, width, height }
// Registers an uploaded source image: verifies the object in R2 (exists, size, real image
// signature), then creates a new ProjectVersion holding it and makes that version current.
export async function POST(req: NextRequest, { params }: Params) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const project = await getOwnedProject(params.id, userId);
  if (!project) return notFound();

  const body = (await readJson(req)) as { storageKey?: unknown; width?: unknown; height?: unknown } | undefined;
  if (!body) return badRequest('Invalid JSON body.');
  const { storageKey, width, height } = body;

  // The key must be one we signed for this project — never another user's or project's object.
  const prefix = projectStoragePrefix(userId, project.id);
  if (typeof storageKey !== 'string' || !storageKey.startsWith(prefix) || !KEY_PATTERN.test(storageKey.slice(prefix.length)))
    return badRequest('Invalid storageKey.');
  if (!isDimension(width) || !isDimension(height))
    return badRequest(`Image must be between ${MIN_UPLOAD_DIMENSION} and ${MAX_UPLOAD_DIMENSION}px per side.`);

  const object = await headObject(storageKey);
  if (!object) return badRequest('Upload not found. Try uploading again.');

  const reject = async (error: string) => {
    await deleteObject(storageKey);
    return badRequest(error);
  };
  if (object.size > MAX_UPLOAD_BYTES) return reject('File is too large.');
  const format = sniffImageFormat(await readObjectStart(storageKey, SNIFF_BYTES));
  if (!format) return reject('That file is not a valid PNG, JPG or WEBP image.');
  if (!storageKey.endsWith(`.${format}`)) return reject('File contents do not match its type.');

  try {
    const asset = await prisma.$transaction(async (tx) => {
      const latest = await tx.projectVersion.findFirst({
        where: { projectId: project.id },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
      });
      const version = await tx.projectVersion.create({
        data: {
          projectId: project.id,
          versionNumber: (latest?.versionNumber ?? 0) + 1,
          parentVersionId: project.currentVersionId,
        },
      });
      const created = await tx.asset.create({
        data: {
          projectId: project.id,
          versionId: version.id,
          type: 'source',
          format,
          storageKey,
          width,
          height,
          colorMode: 'rgb',
          fileSizeBytes: object.size,
        },
      });
      // A new source invalidates any previous vector result, so the project is back to draft.
      await tx.project.update({ where: { id: project.id }, data: { currentVersionId: version.id, status: 'draft' } });
      return created;
    });
    return NextResponse.json({ asset: toAssetDTO(asset) }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
      return NextResponse.json({ error: 'This upload was already registered, or another upload is in progress.' }, { status: 409 });
    throw err;
  }
}
