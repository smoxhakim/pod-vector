import type { NoopJobParams } from '@pod-vector-studio/shared';
import { setTimeout as sleep } from 'node:timers/promises';
import { JobError } from './errors';
import type { JobHandler } from './run-job';

const MAX_DELAY_MS = 10_000;

/** Queue smoke test: waits, reports progress, then succeeds (or fails on request). */
export const noopHandler: JobHandler<NoopJobParams> = async ({ params }, job) => {
  const delay = Math.min(Math.max(params.delayMs ?? 1000, 0), MAX_DELAY_MS);
  await job.updateProgress(50);
  await sleep(delay);
  if (params.fail) throw new JobError('No-op job failed on purpose (fail: true).');
  await job.updateProgress(100);
};
