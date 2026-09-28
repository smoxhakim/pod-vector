import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import type { QueueName } from '@pod-vector-studio/shared';

// Producer side of BullMQ. One Redis connection and one Queue per name, cached on
// globalThis so Next dev hot-reloads don't leak connections.
const globalForQueues = globalThis as unknown as {
  redis?: IORedis;
  queues?: Map<QueueName, Queue>;
};

function redis(): IORedis {
  if (!globalForQueues.redis) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL is not set');
    // Fail fast instead of hanging the request when Redis is down: no offline command
    // queue, one retry, and a short connect timeout. The client keeps reconnecting in
    // the background, so the next request works once Redis is back.
    globalForQueues.redis = new IORedis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2000,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });
    globalForQueues.redis.on('error', (err) => console.error('[queue] redis:', err.message));
  }
  return globalForQueues.redis;
}

export function getQueue(name: QueueName): Queue {
  globalForQueues.queues ??= new Map();
  let queue = globalForQueues.queues.get(name);
  if (!queue) {
    queue = new Queue(name, {
      connection: redis(),
      defaultJobOptions: {
        // The DB Job row is the durable record; keep Redis lean.
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    });
    globalForQueues.queues.set(name, queue);
  }
  return queue;
}
