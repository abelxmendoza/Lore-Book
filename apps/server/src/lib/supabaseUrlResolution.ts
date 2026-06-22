import { logger } from '../logger';

export type SupabaseUrlEnv = {
  primary: string;
  fallback?: string;
  anonKey?: string;
  projectRef?: string;
};

export function projectRefFromSupabaseJwt(jwt: string | undefined): string | null {
  if (!jwt || jwt.split('.').length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')) as {
      ref?: unknown;
    };
    return typeof payload.ref === 'string' && payload.ref.length > 0 ? payload.ref : null;
  } catch {
    return null;
  }
}

export function deriveSupabaseFallbackUrl(env: SupabaseUrlEnv): string | null {
  const explicit = env.fallback?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const ref = env.projectRef?.trim() || projectRefFromSupabaseJwt(env.anonKey);
  if (!ref) return null;

  const defaultUrl = `https://${ref}.supabase.co`;
  const primary = env.primary.trim().replace(/\/$/, '');
  if (!primary || primary === defaultUrl) return null;
  return defaultUrl;
}

export async function probeSupabaseUrl(url: string, timeoutMs = 4000): Promise<boolean> {
  const base = url.replace(/\/$/, '');
  const endpoints = [`${base}/auth/v1/health`, `${base}/rest/v1/`];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'GET',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok || res.status === 401 || res.status === 404) {
        return true;
      }
    } catch {
      // try next endpoint
    }
  }
  return false;
}

export async function resolveSupabaseUrl(
  env: SupabaseUrlEnv,
  options: { timeoutMs?: number } = {}
): Promise<{ url: string; usedFallback: boolean; reason: string }> {
  const timeoutMs = options.timeoutMs ?? 4000;
  const primary = env.primary.trim().replace(/\/$/, '');
  const fallback = deriveSupabaseFallbackUrl(env);

  if (!primary) {
    return { url: '', usedFallback: false, reason: 'missing-primary' };
  }

  if (!fallback) {
    return { url: primary, usedFallback: false, reason: 'no-fallback-configured' };
  }

  if (await probeSupabaseUrl(primary, timeoutMs)) {
    return { url: primary, usedFallback: false, reason: 'primary-healthy' };
  }

  if (await probeSupabaseUrl(fallback, timeoutMs)) {
    return { url: fallback, usedFallback: true, reason: 'primary-unreachable' };
  }

  return { url: primary, usedFallback: false, reason: 'both-unreachable' };
}

let activeSupabaseUrl = (process.env.SUPABASE_URL ?? '').trim().replace(/\/$/, '');

export function getActiveSupabaseUrl(): string {
  if (activeSupabaseUrl) return activeSupabaseUrl;
  // Module init runs before dotenv in config.ts — fall back to env when boot hasn't run yet.
  return (process.env.SUPABASE_URL ?? '').trim().replace(/\/$/, '');
}

export function setActiveSupabaseUrl(url: string): void {
  activeSupabaseUrl = url.replace(/\/$/, '');
  process.env.SUPABASE_URL = activeSupabaseUrl;
}

export async function resolveSupabaseUrlAtBoot(): Promise<string> {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
    return getActiveSupabaseUrl();
  }

  const result = await resolveSupabaseUrl({
    primary: process.env.SUPABASE_URL ?? '',
    fallback: process.env.SUPABASE_URL_FALLBACK,
    anonKey: process.env.SUPABASE_ANON_KEY,
    projectRef: process.env.SUPABASE_PROJECT_REF,
  });

  setActiveSupabaseUrl(result.url || process.env.SUPABASE_URL || '');

  if (result.usedFallback) {
    logger.warn(
      { primary: process.env.SUPABASE_URL, active: result.url, reason: result.reason },
      'Supabase custom domain unreachable — using project *.supabase.co fallback URL'
    );
  } else if (result.reason === 'both-unreachable') {
    logger.error(
      { primary: process.env.SUPABASE_URL, reason: result.reason },
      'Supabase primary and fallback URLs both unreachable at boot — continuing with configured primary'
    );
  }

  return getActiveSupabaseUrl();
}
