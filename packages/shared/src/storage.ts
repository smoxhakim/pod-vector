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

function readConfig(): StorageConfig {
  const { R2_ACCOUNT_ID, R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  const endpoint = R2_ENDPOINT && !R2_ENDPOINT.includes('<')
    ? R2_ENDPOINT
    : R2_ACCOUNT_ID
      ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
      : '';
  const missing = [
    !endpoint && 'R2_ENDPOINT (or R2_ACCOUNT_ID)',
    !R2_BUCKET && 'R2_BUCKET',
    !R2_ACCESS_KEY_ID && 'R2_ACCESS_KEY_ID',
    !R2_SECRET_ACCESS_KEY && 'R2_SECRET_ACCESS_KEY',
  ].filter(Boolean);
  if (missing.length) throw new Error(`Object storage is not configured: set ${missing.join(', ')} in .env`);
  return { endpoint, bucket: R2_BUCKET!, accessKeyId: R2_ACCESS_KEY_ID!, secretAccessKey: R2_SECRET_ACCESS_KEY! };
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
  try {
    readConfig();
    return true;
  } catch {
    return false;
  }
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
