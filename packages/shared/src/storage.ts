// Object storage (Cloudflare R2 via the S3 API). Server-only: import from
// '@pod-vector-studio/shared/storage' in route handlers and the worker, never in client code.

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

interface StorageConfig {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** Values that come from templates/old scaffolding rather than a real R2 bucket. */
const PLACEHOLDER = /^(minioadmin|change-me|your[-_].*|x+)$|</i;

function resolveEndpoint(env: NodeJS.ProcessEnv): string {
  const { R2_ENDPOINT, R2_ACCOUNT_ID } = env;
  if (R2_ENDPOINT && !R2_ENDPOINT.includes('<')) return R2_ENDPOINT;
  return R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '';
}

/**
 * Why object storage can't work with the current env, or null if it looks usable.
 * Never includes secret values — safe to log and to show in dev.
 */
export function storageConfigProblem(env: NodeJS.ProcessEnv = process.env): string | null {
  const endpoint = resolveEndpoint(env);
  const missing = [
    !endpoint && 'R2_ENDPOINT (or R2_ACCOUNT_ID)',
    !env.R2_BUCKET && 'R2_BUCKET',
    !env.R2_ACCESS_KEY_ID && 'R2_ACCESS_KEY_ID',
    !env.R2_SECRET_ACCESS_KEY && 'R2_SECRET_ACCESS_KEY',
  ].filter(Boolean);
  if (missing.length) return `missing ${missing.join(', ')}`;

  const placeholders = (['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'] as const).filter((k) =>
    PLACEHOLDER.test(env[k] ?? ''),
  );
  if (placeholders.length) return `${placeholders.join(', ')} still ${placeholders.length > 1 ? 'have' : 'has'} placeholder values`;

  // The old local-MinIO default: nothing listens there any more.
  if (/^https?:\/\/(localhost|127\.0\.0\.1):9000\/?$/.test(endpoint)) return `R2_ENDPOINT points at ${endpoint} (old local MinIO default)`;
  if (!/^https?:\/\//.test(endpoint)) return 'R2_ENDPOINT must be a full URL like https://<account>.r2.cloudflarestorage.com';
  return null;
}

/** Human-readable one-liner for startup logs and dev error messages. */
export function storageConfigHint(problem: string): string {
  return `File storage is not set up: ${problem}. Put your Cloudflare R2 bucket details in the root .env (README → "Storage setup") and restart.`;
}

function readConfig(): StorageConfig {
  const problem = storageConfigProblem();
  if (problem) throw new Error(storageConfigHint(problem));
  const { R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  return {
    endpoint: resolveEndpoint(process.env),
    bucket: R2_BUCKET!,
    accessKeyId: R2_ACCESS_KEY_ID!,
    secretAccessKey: R2_SECRET_ACCESS_KEY!,
  };
}

let cached: { client: S3Client; bucket: string } | undefined;

function s3() {
  if (!cached) {
    const config = readConfig();
    cached = {
      bucket: config.bucket,
      client: new S3Client({
        region: 'auto',
        forcePathStyle: true,
        endpoint: config.endpoint,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
        // SDK defaults add CRC32 checksums to presigned PUTs, which browsers can't satisfy.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      }),
    };
  }
  return cached;
}

export function isStorageConfigured(): boolean {
  return storageConfigProblem() === null;
}

/** Presigned PUT for a direct browser upload. Content-Type is part of the signature. */
export async function presignUpload(key: string, contentType: string, expiresIn = 300): Promise<string> {
  const { client, bucket } = s3();
  return getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), { expiresIn });
}

/** Presigned GET, optionally forcing a download with a friendly filename. */
export async function presignDownload(key: string, opts: { expiresIn?: number; filename?: string } = {}): Promise<string> {
  const { client, bucket } = s3();
  const disposition = opts.filename
    ? `attachment; filename="${opts.filename.replace(/["\\\r\n]/g, '')}"`
    : undefined;
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentDisposition: disposition }), {
    expiresIn: opts.expiresIn ?? 3600,
  });
}

export async function headObject(key: string): Promise<{ size: number; contentType?: string } | null> {
  const { client, bucket } = s3();
  try {
    const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { size: res.ContentLength ?? 0, contentType: res.ContentType };
  } catch (err) {
    if (err instanceof S3ServiceException && err.$metadata.httpStatusCode === 404) return null;
    throw err;
  }
}

/** First `length` bytes of an object (for signature sniffing without downloading it all). */
export async function readObjectStart(key: string, length: number): Promise<Uint8Array> {
  const { client, bucket } = s3();
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${length - 1}` }));
  return res.Body ? res.Body.transformToByteArray() : new Uint8Array();
}

/** Whole object as bytes (worker-side processing input). */
export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const { client, bucket } = s3();
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!res.Body) throw new Error(`Empty object: ${key}`);
  return res.Body.transformToByteArray();
}

/** Server-side upload (worker outputs such as vector SVGs). */
export async function putObject(key: string, body: Uint8Array | string, contentType: string): Promise<void> {
  const { client, bucket } = s3();
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
}

export async function deleteObject(key: string): Promise<void> {
  await deleteKeys([key]);
}

/** Deletes every object under a prefix (e.g. a whole project). */
export async function deletePrefix(prefix: string): Promise<void> {
  const { client, bucket } = s3();
  let token: string | undefined;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    const keys = (page.Contents ?? []).map((o) => o.Key!).filter(Boolean);
    if (keys.length) await deleteKeys(keys);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
}

async function deleteKeys(keys: string[]) {
  const { client, bucket } = s3();
  await client.send(
    new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }),
  );
}
