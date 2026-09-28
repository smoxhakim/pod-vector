// Upload rules shared by the browser (pre-flight checks), API (signing/registration)
// and worker (re-validation). Browser-safe: no Node imports.

export const UPLOAD_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
} as const;

export type UploadContentType = keyof typeof UPLOAD_TYPES;
export type UploadFormat = (typeof UPLOAD_TYPES)[UploadContentType];

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_UPLOAD_DIMENSION = 12_000;
export const MIN_UPLOAD_DIMENSION = 16;

export function isUploadContentType(value: unknown): value is UploadContentType {
  return typeof value === 'string' && value in UPLOAD_TYPES;
}

/** Bytes needed by sniffImageFormat. */
export const SNIFF_BYTES = 12;

/** Identify PNG/JPEG/WEBP from file signature bytes — never trust the extension. */
export function sniffImageFormat(bytes: Uint8Array): UploadFormat | null {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a)
    return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (
    b.length >= 12 &&
    String.fromCharCode(b[0], b[1], b[2], b[3]) === 'RIFF' &&
    String.fromCharCode(b[8], b[9], b[10], b[11]) === 'WEBP'
  )
    return 'webp';
  return null;
}

/** Storage key layout: everything a project owns lives under one prefix (easy cleanup). */
export function projectStoragePrefix(userId: string, projectId: string): string {
  return `users/${userId}/projects/${projectId}/`;
}
