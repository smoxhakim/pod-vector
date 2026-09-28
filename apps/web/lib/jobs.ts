import { prisma, type Job, type JobType, type Prisma } from '@pod-vector-studio/db';
import { JOB_TYPE_QUEUE, type JobPayload } from '@pod-vector-studio/shared';
import { getQueue } from './queue';

export interface JobDTO {
  id: string;
  projectId: string;
  versionId: string | null;
  type: Job['type'];
  status: Job['status'];
  params: unknown;
  resultAssetId: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export function toJobDTO(j: Job): JobDTO {
  return {
    id: j.id,
    projectId: j.projectId,
    versionId: j.versionId,
    type: j.type,
    status: j.status,
    params: j.params,
    resultAssetId: j.resultAssetId,
    errorMessage: j.errorMessage,
    createdAt: j.createdAt.toISOString(),
    startedAt: j.startedAt?.toISOString() ?? null,
    completedAt: j.completedAt?.toISOString() ?? null,
  };
}

/**
 * The one way to start background work: writes the Job row (queued), then pushes
 * { jobId, projectId, versionId, params } onto the job type's BullMQ queue with the
 * same id. Callers must have checked project ownership already.
 *
 * If the queue is unreachable the row is marked failed and returned — routes should
 * answer 503 when `job.status === 'failed'`.
 */
export async function enqueueJob(input: {
  type: JobType;
  projectId: string;
  versionId?: string | null;
  params?: Prisma.InputJsonObject;
}): Promise<Job> {
  const queueName = JOB_TYPE_QUEUE[input.type];
  if (!queueName) throw new Error(`No queue configured for job type "${input.type}"`);

  const params = input.params ?? {};
  const job = await prisma.job.create({
    data: { type: input.type, projectId: input.projectId, versionId: input.versionId ?? null, params, status: 'queued' },
  });

  const payload: JobPayload = {
    jobId: job.id,
    projectId: job.projectId,
    versionId: job.versionId ?? undefined,
    params: params as Record<string, unknown>,
  };
  try {
    await getQueue(queueName).add(input.type, payload, { jobId: job.id });
  } catch (err) {
    console.error(`[jobs] failed to enqueue ${job.id}:`, err);
    return prisma.job.update({
      where: { id: job.id },
      data: { status: 'failed', errorMessage: 'Could not queue the job. Please try again.', completedAt: new Date() },
    });
  }
  return job;
}

/** Job only if its project belongs to the user — callers respond 404 otherwise. */
export function getOwnedJob(jobId: string, userId: string) {
  return prisma.job.findFirst({ where: { id: jobId, project: { userId } } });
}
