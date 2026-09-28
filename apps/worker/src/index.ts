// Worker service entrypoint: registers one BullMQ consumer per implemented job family.
// Queues are only consumed once their handler exists, so unimplemented job types stay
// queued instead of being silently marked complete.

import './env'; // must load before anything reads process.env (Prisma, Redis)

import { prisma } from '@pod-vector-studio/db';
import { QUEUES, type QueueName } from '@pod-vector-studio/shared';
import { Worker, type Processor } from 'bullmq';
import { noopHandler } from './jobs/noop';
import { vectorizeHandler } from './jobs/vectorize';
import { runJob } from './jobs/run-job';
import { connection } from './redis';

// Filled in as roadmap milestones land (vectorize, background-removal, export, ...).
const handlers: Partial<Record<QueueName, Processor<any>>> = {
  [QUEUES.system]: runJob(noopHandler),
  [QUEUES.vectorize]: runJob(vectorizeHandler),
};

function startWorkers(): Worker[] {
  const workers = Object.entries(handlers).map(([queue, processor]) => {
    const worker = new Worker(queue, processor, { connection });
    worker.on('completed', (job) => console.log(`[${queue}] ${job.name} ${job.id} completed`));
    worker.on('failed', (job, err) => console.error(`[${queue}] ${job?.name} ${job?.id} failed: ${err.message}`));
    return worker;
  });
  console.log(`Worker started. Consuming queues: ${Object.keys(handlers).join(', ') || '(none yet)'}`);
  return workers;
}

const workers = startWorkers();

async function shutdown(signal: string) {
  console.log(`${signal} received, draining workers...`);
  await Promise.all(workers.map((w) => w.close()));
  await Promise.all([connection.quit(), prisma.$disconnect()]);
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
