import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUserId, unauthorized } from '@/lib/auth';
import { badRequest, notFound, readJson, serviceUnavailable } from '@/lib/http';
import { enqueueJob, toJobDTO } from '@/lib/jobs';
import { getOwnedProject } from '@/lib/projects';

// POST /api/dev/noop-job { projectId, delayMs?, fail? } — dev-only queue smoke test.
// Proves web → Redis → worker → DB round trip without any real processing.
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') return notFound();

  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const body = (await readJson(req)) as { projectId?: unknown; delayMs?: unknown; fail?: unknown } | undefined;
  if (!body || typeof body.projectId !== 'string') return badRequest('projectId is required.');

  const project = await getOwnedProject(body.projectId, userId);
  if (!project) return notFound();

  const job = await enqueueJob({
    type: 'noop',
    projectId: project.id,
    versionId: project.currentVersionId,
    params: {
      delayMs: typeof body.delayMs === 'number' ? body.delayMs : 1500,
      fail: body.fail === true,
    },
  });
  if (job.status === 'failed') return serviceUnavailable(job.errorMessage ?? 'Could not queue the job.');
  return NextResponse.json({ job: toJobDTO(job) }, { status: 202 });
}
