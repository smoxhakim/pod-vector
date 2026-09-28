// Queue names shared by the web app (producer) and worker (consumer).
// One queue per job family, per ARCHITECTURE.md "System components".

export const QUEUES = {
  vectorize: 'vectorize',
  cleanup: 'cleanup',
  backgroundRemoval: 'background-removal',
  colorConvert: 'color-convert',
  validate: 'validate',
  export: 'export',
  batch: 'batch',
  ai: 'ai',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** Every BullMQ payload carries the DB Job row id so the worker can update status. */
export interface BaseJobPayload {
  jobId: string;
  projectId: string;
  versionId?: string;
}
