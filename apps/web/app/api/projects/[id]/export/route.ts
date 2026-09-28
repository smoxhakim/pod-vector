import { prisma } from '@pod-vector-studio/db';
import { EXPORT_FORMATS, type ExportFormat, type ExportJobParams } from '@pod-vector-studio/shared';
import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUserId, unauthorized } from '@/lib/auth';
import { badRequest, notFound, readJson, serviceUnavailable } from '@/lib/http';
import { enqueueJob, toJobDTO } from '@/lib/jobs';
import { getCurrentVector, getOwnedProject } from '@/lib/projects';

interface Params {
  params: { id: string };
}

// POST /api/projects/:id/export { format: 'svg' | 'png' }
//   202 { job } — export queued
//   200 { job } — this exact vector was already exported in this format; reuse it
//   409 { job } — the same export is already running
export async function POST(req: NextRequest, { params }: Params) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const project = await getOwnedProject(params.id, userId);
  if (!project) return notFound();

  const body = (await readJson(req)) as { format?: unknown } | undefined;
  if (!body) return badRequest('Invalid JSON body.');
  const format = body.format as ExportFormat;
  if (!EXPORT_FORMATS.includes(format)) return badRequest('format must be "svg" or "png".');

  const vector = await getCurrentVector(project);
  if (!vector || !project.currentVersionId) return badRequest('Vectorize the design before exporting.');

  const sameExport = {
    versionId: project.currentVersionId,
    type: 'export' as const,
    AND: [
      { params: { path: ['format'], equals: format } },
      { params: { path: ['vectorAssetId'], equals: vector.id } },
    ],
  };
  const done = await prisma.job.findFirst({
    where: { ...sameExport, status: 'completed', resultAssetId: { not: null } },
    orderBy: { createdAt: 'desc' },
  });
  if (done) return NextResponse.json({ job: toJobDTO(done) });

  const running = await prisma.job.findFirst({ where: { ...sameExport, status: { in: ['queued', 'processing'] } } });
  if (running) return NextResponse.json({ job: toJobDTO(running) }, { status: 409 });

  const jobParams: ExportJobParams = { format, vectorAssetId: vector.id };
  const job = await enqueueJob({ type: 'export', projectId: project.id, versionId: project.currentVersionId, params: jobParams });
  if (job.status === 'failed') return serviceUnavailable(job.errorMessage ?? 'Could not queue the export.');
  return NextResponse.json({ job: toJobDTO(job) }, { status: 202 });
}
