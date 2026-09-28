import { prisma } from '@pod-vector-studio/db';
import {
  BACKGROUND_METHODS,
  isHexColor,
  type BackgroundJobParams,
  type BackgroundMethod,
} from '@pod-vector-studio/shared';
import { deleteObject } from '@pod-vector-studio/shared/storage';
import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUserId, unauthorized } from '@/lib/auth';
import { badRequest, notFound, readJson, serviceUnavailable } from '@/lib/http';
import { enqueueJob, toJobDTO } from '@/lib/jobs';
import { getOwnedProject } from '@/lib/projects';

interface Params {
  params: { id: string };
}

// POST /api/projects/:id/remove-background
//   { method: 'auto' }                                   → detect + remove (202 { job })
//   { method: 'color', color, tolerance?, contiguous? }   → remove a picked colour (202 { job })
//   { method: 'none' }                                   → restore the original background (200)
export async function POST(req: NextRequest, { params }: Params) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const project = await getOwnedProject(params.id, userId);
  if (!project) return notFound();

  const body = (await readJson(req)) as Record<string, unknown> | undefined;
  if (!body) return badRequest('Invalid JSON body.');
  const method = body.method as BackgroundMethod;
  if (!BACKGROUND_METHODS.includes(method)) return badRequest('method must be "auto", "color" or "none".');

  const versionId = project.currentVersionId;
  const hasSource = versionId && (await prisma.asset.count({ where: { versionId, type: 'source' } }));
  if (!versionId || !hasSource) return badRequest('Upload an image first.');

  const running = await prisma.job.findFirst({
    where: { versionId, type: 'background_removal', status: { in: ['queued', 'processing'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (running) return NextResponse.json({ job: toJobDTO(running) }, { status: 409 });

  if (method === 'none') {
    const cleaned = await prisma.asset.findMany({ where: { versionId, type: 'cleaned' }, select: { id: true, storageKey: true } });
    await prisma.$transaction([
      prisma.asset.deleteMany({ where: { id: { in: cleaned.map((a) => a.id) } } }),
      prisma.projectVersion.update({ where: { id: versionId }, data: { backgroundSettings: {} } }),
    ]);
    await Promise.all(cleaned.map((a) => deleteObject(a.storageKey).catch(() => {})));
    return NextResponse.json({ job: null });
  }

  const jobParams: BackgroundJobParams = { method };
  if (method === 'color') {
    if (!isHexColor(body.color)) return badRequest('color must be a hex colour like #ffffff.');
    jobParams.color = body.color.toLowerCase();
  }
  if (body.tolerance !== undefined) {
    if (typeof body.tolerance !== 'number' || body.tolerance < 0 || body.tolerance > 100)
      return badRequest('tolerance must be a number from 0 to 100.');
    jobParams.tolerance = body.tolerance;
  }
  if (body.contiguous !== undefined) {
    if (typeof body.contiguous !== 'boolean') return badRequest('contiguous must be true or false.');
    jobParams.contiguous = body.contiguous;
  }

  const job = await enqueueJob({ type: 'background_removal', projectId: project.id, versionId, params: jobParams });
  if (job.status === 'failed') return serviceUnavailable(job.errorMessage ?? 'Could not queue the job.');
  await prisma.project.update({ where: { id: project.id }, data: { status: 'processing' } });
  return NextResponse.json({ job: toJobDTO(job) }, { status: 202 });
}
