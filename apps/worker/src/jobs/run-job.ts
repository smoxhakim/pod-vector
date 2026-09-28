import { prisma } from '@pod-vector-studio/db';
import type { JobPayload } from '@pod-vector-studio/shared';
import type { Job as BullJob, Processor } from 'bullmq';
import { JobError } from './errors';

export interface JobResult {
  /** Asset produced by the job, if any (e.g. the vector SVG). */
  resultAssetId?: string;
}

export type JobHandler<P = Record<string, unknown>> = (payload: JobPayload<P>, job: BullJob<JobPayload<P>>) => Promise<JobResult | void>;

/**
 * Wraps a handler with the DB Job row lifecycle: queued → processing → completed/failed.
 * The row is the source of truth the web app polls; BullMQ just delivers the work.
 */
export function runJob<P>(handler: JobHandler<P>): Processor<JobPayload<P>> {
  return async (job) => {
    const { jobId } = job.data;
    const row = await prisma.job.findUnique({ where: { id: jobId }, select: { status: true } });
    if (!row) {
      // Project (and its jobs) deleted after enqueue — nothing to do.
      console.warn(`[${job.queueName}] job ${jobId} has no DB row, skipping`);
      return;
    }
    if (row.status === 'completed') return; // duplicate delivery

    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'processing', startedAt: new Date(), errorMessage: null },
    });

    try {
      const result = (await handler(job.data, job)) ?? {};
      await prisma.job.update({
        where: { id: jobId },
        data: { status: 'completed', completedAt: new Date(), resultAssetId: result.resultAssetId ?? null },
      });
    } catch (err) {
      const message = userFacingMessage(err);
      if (!(err instanceof JobError)) console.error(`[${job.queueName}] job ${jobId} error:`, err);
      const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      await prisma.job
        .update({
          where: { id: jobId },
          data: finalAttempt
            ? { status: 'failed', errorMessage: message, completedAt: new Date() }
            : { status: 'queued', errorMessage: message },
        })
        .catch(() => {}); // row may be gone if the project was deleted mid-job
      throw err;
    }
  };
}

/** Errors meant for users pass through; anything else gets a generic message (details are logged). */
function userFacingMessage(err: unknown): string {
  if (err instanceof JobError) return err.message;
  return 'Processing failed unexpectedly. Please try again.';
}
