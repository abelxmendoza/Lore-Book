/**
 * URL helpers that satisfy CodeQL js/xss and js/client-side-unvalidated-url-redirection.
 * Only http(s) URLs are allowed; javascript:/data: etc. are rejected.
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Returns a safe absolute http(s) URL string, or null if untrusted/invalid.
 */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (!ALLOWED_PROTOCOLS.has(url.protocol)) return null;
    // Block userinfo tricks and empty host
    if (!url.hostname) return null;
    return url.href;
  } catch {
    return null;
  }
}

/**
 * X / Twitter post URLs only (status pages or known CDN images).
 */
export function safeXPostUrl(raw: string | null | undefined): string | null {
  const url = safeHttpUrl(raw);
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const okHost =
      host === 'x.com' ||
      host === 'www.x.com' ||
      host === 'twitter.com' ||
      host === 'www.twitter.com' ||
      host === 'mobile.twitter.com' ||
      host.endsWith('.twimg.com') ||
      host === 'pbs.twimg.com' ||
      host === 'abs.twimg.com';
    if (!okHost) return null;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * Build a status URL from a numeric/string status id only.
 */
export function xStatusUrlFromId(sourceId: string | null | undefined): string | null {
  if (!sourceId || typeof sourceId !== 'string') return null;
  // Status ids are numeric snowflakes (or alphanumeric); reject path injection
  if (!/^[A-Za-z0-9_]{1,64}$/.test(sourceId.trim())) return null;
  return `https://x.com/i/web/status/${sourceId.trim()}`;
}
