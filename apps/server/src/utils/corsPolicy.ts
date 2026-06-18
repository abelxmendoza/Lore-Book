/**
 * CORS origin policy — extracted into a pure, testable module.
 *
 * The browser-facing failure during the 2026-06-18 outage ("No
 * 'Access-Control-Allow-Origin' header") was a *symptom* of the backend being
 * down, but the allow-list itself is security-critical and easy to break, so it
 * deserves dedicated tests. Keeping the decision logic pure (no Express, no
 * logger) lets us assert every branch deterministically.
 */

/** Always-allowed first-party production origins. */
export const STATIC_ALLOWED_ORIGINS = [
  'https://lorebookai.com',
  'https://www.lorebookai.com',
  'https://lorebook.app',
  'https://www.lorebook.app',
  'https://lore-keeper-web.vercel.app',
] as const;

/**
 * Normalize an origin-ish string to its canonical `scheme://host[:port]` form.
 * Returns null for empty input. Falls back to a trailing-slash-trimmed string
 * when the value is not a parseable URL (defensive — never throws).
 */
export function normalizeOrigin(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/+$/, '');
  }
}

/**
 * Build the de-duplicated allow-list from static origins plus env-configured
 * ones (FRONTEND_URL and the VITE_API_URL host).
 */
export function getAllowedCorsOrigins(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const configured = [
    env.FRONTEND_URL,
    env.VITE_API_URL?.replace(/\/api\/?$/, ''),
    ...STATIC_ALLOWED_ORIGINS,
  ];

  return [
    ...new Set(
      configured
        .map(normalizeOrigin)
        .filter((o): o is string => Boolean(o))
    ),
  ];
}

const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const VERCEL_PREVIEW_RE = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

export type OriginDecision = {
  allowed: boolean;
  /** Why the decision was made — useful for logging blocked requests. */
  reason:
    | 'no-origin'
    | 'localhost'
    | 'vercel-preview'
    | 'allow-list'
    | 'not-allowed';
};

export type OriginPolicyOptions = {
  /** Allow any localhost / 127.0.0.1 origin (dev tools, simulators). Default true. */
  allowLocalhost?: boolean;
  /** Allow Vercel preview deployments (*.vercel.app). Default true. */
  allowVercelPreview?: boolean;
};

/**
 * Decide whether a request origin should be allowed.
 *
 * Requests with no Origin header (curl, mobile apps, same-origin/server-to-server)
 * are allowed — they are not subject to the browser CORS model.
 */
export function evaluateOrigin(
  origin: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  options: OriginPolicyOptions = {}
): OriginDecision {
  const { allowLocalhost = true, allowVercelPreview = true } = options;

  if (!origin) {
    return { allowed: true, reason: 'no-origin' };
  }

  if (allowLocalhost && LOCALHOST_RE.test(origin)) {
    return { allowed: true, reason: 'localhost' };
  }

  if (allowVercelPreview && VERCEL_PREVIEW_RE.test(origin)) {
    return { allowed: true, reason: 'vercel-preview' };
  }

  const normalized = normalizeOrigin(origin);
  const allowList = getAllowedCorsOrigins(env);
  if (normalized && allowList.includes(normalized)) {
    return { allowed: true, reason: 'allow-list' };
  }

  return { allowed: false, reason: 'not-allowed' };
}

/** Convenience boolean wrapper around {@link evaluateOrigin}. */
export function isOriginAllowed(
  origin: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  options: OriginPolicyOptions = {}
): boolean {
  return evaluateOrigin(origin, env, options).allowed;
}
