import { prisma } from '@pod-vector-studio/db';
import {
  AVAILABLE_VECTORIZE_MODES,
  VECTORIZE_MODES,
  type VectorizeJobParams,
  type VectorizeMode,
  type VectorizeParams,
} from '@pod-vector-studio/shared';
import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUserId, unauthorized } from '@/lib/auth';
import { badRequest, notFound, readJson, serviceUnavailable } from '@/lib/http';
import { enqueueJob, toJobDTO } from '@/lib/jobs';
import { getOwnedProject } from '@/lib/projects';

interface Params {
  params: { id: string };
}

const QUALITY_KEYS: (keyof VectorizeParams)[] = [
  'detailLevel',
  'colorCount',
  'smoothness',
  'cornerSensitivity',
  'noiseThreshold',
  'minShapeSize',
];

function parseQuality(value: unknown): VectorizeParams | string {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) return 'quality must be an object.';
  const quality: VectorizeParams = {};
  for (const [key, v] of Object.entries(value)) {
    if (!QUALITY_KEYS.includes(key as keyof VectorizeParams)) return `Unknown quality setting "${key}".`;
    if (typeof v !== 'number' || !Number.isFinite(v)) return `${key} must be a number.`;
    quality[key as keyof VectorizeParams] = v; // engine clamps to valid ranges
  }
  return quality;
}

// POST /api/projects/:id/vectorize { mode, quality? } → 202 { job }
// Vectorizes the current version's source image in the worker.
export async function POST(req: NextRequest, { params }: Params) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const project = await getOwnedProject(params.id, userId);
  if (!project) return notFound();

  const body = (await readJson(req)) as { mode?: unknown; quality?: unknown } | undefined;
  if (!body) return badRequest('Invalid JSON body.');
  const mode = (body.mode ?? 'logo') as VectorizeMode;
  if (!VECTORIZE_MODES.includes(mode)) return badRequest('Unknown vectorization mode.');
  if (!AVAILABLE_VECTORIZE_MODES.includes(mode)) return badRequest(`"${mode}" mode is coming soon — use Logo mode for now.`);
  const quality = parseQuality(body.quality);
  if (typeof quality === 'string') return badRequest(quality);

  const versionId = project.currentVersionId;
  const hasSource = versionId && (await prisma.asset.count({ where: { versionId, type: 'source' } }));
  if (!versionId || !hasSource) return badRequest('Upload an image before vectorizing.');

  // One vectorization per version at a time: hand back the one already running.
  const running = await prisma.job.findFirst({
    where: { versionId, type: 'vectorize', status: { in: ['queued', 'processing'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (running) return NextResponse.json({ job: toJobDTO(running) }, { status: 409 });

  const jobParams: VectorizeJobParams = { mode, quality };
  const job = await enqueueJob({
    type: 'vectorize',
    projectId: project.id,
    versionId,
    params: jobParams,
  });
  if (job.status === 'failed') return serviceUnavailable(job.errorMessage ?? 'Could not queue the job.');

  await prisma.project.update({ where: { id: project.id }, data: { status: 'processing' } });
  return NextResponse.json({ job: toJobDTO(job) }, { status: 202 });
}
