// Queue names shared by the web app (producer) and worker (consumer).
// One queue per job family, per ARCHITECTURE.md "System components".

export const QUEUES = {
  system: 'system',
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

/** Which queue each DB JobType runs on. Types without an entry can't be enqueued yet. */
export const JOB_TYPE_QUEUE: Partial<Record<string, QueueName>> = {
  noop: QUEUES.system,
  cleanup: QUEUES.cleanup,
  background_removal: QUEUES.backgroundRemoval,
  vectorize: QUEUES.vectorize,
  cmyk_convert: QUEUES.colorConvert,
  validate: QUEUES.validate,
  export: QUEUES.export,
  ai_upscale: QUEUES.ai,
  mockup_generate: QUEUES.ai,
};

/**
 * Every BullMQ payload is { jobId, projectId, versionId?, params }. The DB Job row
 * (id = jobId) is the source of truth for status; BullMQ only carries the work.
 */
export interface JobPayload<P = Record<string, unknown>> {
  jobId: string;
  projectId: string;
  versionId?: string;
  params: P;
}

export interface NoopJobParams {
  /** How long the job pretends to work (capped by the worker). */
  delayMs?: number;
  /** Throw instead of completing — exercises the failure path. */
  fail?: boolean;
}

export const TERMINAL_JOB_STATUSES = ['completed', 'failed'] as const;
