import { randomUUID } from 'node:crypto';
import { MAX_UPLOAD_BYTES, UPLOAD_TYPES, isUploadContentType, projectStoragePrefix } from '@pod-vector-studio/shared';
import { presignUpload, storageConfigHint, storageConfigProblem } from '@pod-vector-studio/shared/storage';
import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUserId, unauthorized } from '@/lib/auth';
import { badRequest, notFound, readJson, serviceUnavailable } from '@/lib/http';
import { getOwnedProject } from '@/lib/projects';

// POST /api/uploads/sign { projectId, contentType, size } → presigned R2 PUT for a source image.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const body = (await readJson(req)) as { projectId?: unknown; contentType?: unknown; size?: unknown } | undefined;
  if (!body) return badRequest('Invalid JSON body.');
  const { projectId, contentType, size } = body;

  if (typeof projectId !== 'string') return badRequest('projectId is required.');
  if (!isUploadContentType(contentType)) return badRequest('Upload a PNG, JPG or WEBP image.');
  if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) return badRequest('size must be a positive integer.');
  if (size > MAX_UPLOAD_BYTES) return badRequest(`File is too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).`);

  const project = await getOwnedProject(projectId, userId);
  if (!project) return notFound();

  // Don't hand out an upload URL that points nowhere (e.g. template values left in .env).
  const storageProblem = storageConfigProblem();
  if (storageProblem) {
    console.error(`[uploads] ${storageConfigHint(storageProblem)}`);
    return serviceUnavailable(
      process.env.NODE_ENV === 'production'
        ? 'Uploads are temporarily unavailable. Please try again later.'
        : storageConfigHint(storageProblem),
    );
  }

  const storageKey = `${projectStoragePrefix(userId, project.id)}source/${randomUUID()}.${UPLOAD_TYPES[contentType]}`;
  const uploadUrl = await presignUpload(storageKey, contentType);

  return NextResponse.json({ uploadUrl, storageKey, headers: { 'Content-Type': contentType } });
}
