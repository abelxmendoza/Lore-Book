import type { Request } from 'express';

/**
 * Best-effort client id for rate-limit bucketing.
 *
 * Prefer authenticated `req.user.id`. When the global limiter runs *before*
 * auth middleware (as with `app.use('/api', tieredRateLimit)`), peek the JWT
 * `sub` from the Bearer token without verifying it — verification still
 * happens in auth. Spoofing `sub` only moves the caller into another bucket;
 * it cannot grant access.
 */
export function getRateLimitClientId(req: Request): string {
  const userId = (req as Request & { user?: { id?: string } }).user?.id;
  if (userId) return userId;

  const fromJwt = peekBearerSub(req.headers.authorization);
  if (fromJwt) return fromJwt;

  return req.ip || 'anonymous';
}

/** Decode JWT payload `sub` without signature verification (bucket key only). */
export function peekBearerSub(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : authorization.trim();
  if (!token || token.length < 20) return null;

  const parts = token.split('.');
  if (parts.length < 2) return null;

  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(json) as { sub?: unknown };
    return typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null;
  } catch {
    return null;
  }
}
