// Worker service entrypoint: registers one BullMQ consumer per implemented job family.
// Queues are only consumed once their handler exists, so unimplemented job types stay
// queued instead of being silently marked complete.

import { Worker, type Processor } from 'bullmq';
import type { QueueName } from '@pod-vector-studio/shared';
import { connection } from './redis';

// Filled in as roadmap milestones land (vectorize, background-removal, export, ...).
const handlers: Partial<Record<QueueName, Processor>> = {};

function startWorkers(): Worker[] {
  const workers = Object.entries(handlers).map(([queue, processor]) => {
    const worker = new Worker(queue, processor, { connection });
    worker.on('failed', (job, err) => console.error(`[${queue}] job ${job?.id} failed:`, err.message));
    return worker;
  });
  console.log(`Worker started. Consuming queues: ${Object.keys(handlers).join(', ') || '(none yet)'}`);
  return workers;
}

const workers = startWorkers();

async function shutdown(signal: string) {
  console.log(`${signal} received, draining workers...`);
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
