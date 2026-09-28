/** Only allow same-origin relative paths as post-login destinations. */
export function safeCallbackUrl(value: string | null | undefined, fallback = '/dashboard'): string {
  if (!value) return fallback;
  try {
    // Absolute URLs from middleware (http://host/dashboard) are reduced to their path.
    const url = new URL(value, 'http://placeholder.invalid');
    if (value.startsWith('/') && !value.startsWith('//')) return url.pathname + url.search;
    if (typeof window !== 'undefined' && url.origin === window.location.origin) return url.pathname + url.search;
  } catch {
    // fall through
  }
  return fallback;
}
