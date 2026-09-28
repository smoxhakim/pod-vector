import IORedis from 'ioredis';
import { env } from './env';

// BullMQ workers require maxRetriesPerRequest: null on their blocking connection.
export const connection = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
