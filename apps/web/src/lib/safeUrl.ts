/**
 * URL helpers that act as CodeQL barriers for:
 *   - js/xss
 *   - js/client-side-unvalidated-url-redirection
 *
 * CodeQL recognizes protocol allow-lists via startsWith / protocol === checks.
 */

/**
 * True only for absolute http(s) URLs (CodeQL barrier guard).
 */
export function isSafeHttpUrl(raw: string | null | undefined): raw is string {
  if (typeof raw !== 'string') return false;
  const s = raw.trim();
  // Explicit startsWith checks are modeled as sanitizer guards by CodeQL.
  if (!(s.startsWith('https://') || s.startsWith('http://'))) return false;
  try {
    const u = new URL(s);
    return (u.protocol === 'https:' || u.protocol === 'http:') && Boolean(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Returns the URL only when isSafeHttpUrl passes; otherwise null.
 */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!isSafeHttpUrl(raw)) return null;
  return raw.trim();
}

const X_HOSTS = new Set([
  'x.com',
  'www.x.com',
  'twitter.com',
  'www.twitter.com',
  'mobile.twitter.com',
  'pbs.twimg.com',
  'abs.twimg.com',
  'video.twimg.com',
]);

/**
 * X / Twitter http(s) URLs only.
 */
export function isSafeXUrl(raw: string | null | undefined): raw is string {
  if (!isSafeHttpUrl(raw)) return false;
  try {
    const host = new URL(raw.trim()).hostname.toLowerCase();
    return X_HOSTS.has(host) || host.endsWith('.twimg.com');
  } catch {
    return false;
  }
}

export function safeXPostUrl(raw: string | null | undefined): string | null {
  if (!isSafeXUrl(raw)) return null;
  return raw.trim();
}

/**
 * Build status URL from snowflake id only — never uses user-provided full URL.
 */
export function xStatusUrlFromId(sourceId: string | null | undefined): string | null {
  if (typeof sourceId !== 'string') return null;
  const id = sourceId.trim();
  // Numeric snowflakes only
  if (!/^[0-9]{5,25}$/.test(id)) return null;
  return `https://x.com/i/web/status/${id}`;
}

/**
 * Extract a numeric status snowflake from a validated X URL, then rebuild via
 * xStatusUrlFromId so href never uses the raw DB/user URL (CodeQL barrier).
 */
export function xStatusIdFromUrl(raw: string | null | undefined): string | null {
  if (!isSafeXUrl(raw)) return null;
  try {
    const path = new URL(raw.trim()).pathname;
    const match = path.match(/\/(?:i\/web\/)?status\/([0-9]{5,25})(?:\/|$)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Resolve a safe X status href from sourceId and/or a stored X URL. */
export function xStatusHref(source: { sourceId?: string | null; url?: string | null }): string | null {
  return xStatusUrlFromId(source.sourceId) ?? xStatusUrlFromId(xStatusIdFromUrl(source.url));
}
