import { config } from 'dotenv';
import { resolve } from 'node:path';

// The monorepo keeps a single .env at the repo root; in production, env comes from the host.
config({ path: resolve(__dirname, '../../../.env') });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

export const env = {
  redisUrl: required('REDIS_URL'),
};
