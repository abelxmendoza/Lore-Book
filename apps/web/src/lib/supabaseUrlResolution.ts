const CACHE_KEY = 'lk-supabase-active-url';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export type SupabaseUrlEnv = {
  primary: string;
  fallback?: string;
  anonKey?: string;
  projectRef?: string;
};

function readJwtRef(jwt: string | undefined): string | null {
  if (!jwt || jwt.split('.').length < 2) return null;
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as {
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

  const ref = env.projectRef?.trim() || readJwtRef(env.anonKey);
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

function readCachedUrl(primary: string, fallback: string | null): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { url?: string; at?: number };
    if (!parsed.url || !parsed.at || Date.now() - parsed.at > CACHE_TTL_MS) return null;
    if (parsed.url === primary || parsed.url === fallback) return parsed.url;
  } catch {
    // ignore
  }
  return null;
}

function writeCachedUrl(url: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ url, at: Date.now() }));
  } catch {
    // ignore
  }
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

  const cached = readCachedUrl(primary, fallback);
  if (cached === fallback) {
    if (await probeSupabaseUrl(primary, Math.min(timeoutMs, 2500))) {
      writeCachedUrl(primary);
      return { url: primary, usedFallback: false, reason: 'primary-restored' };
    }
    if (await probeSupabaseUrl(fallback, timeoutMs)) {
      return { url: fallback, usedFallback: true, reason: 'cached-fallback' };
    }
  } else if (cached === primary && (await probeSupabaseUrl(primary, Math.min(timeoutMs, 2500)))) {
    return { url: primary, usedFallback: false, reason: 'cached-primary' };
  }

  if (await probeSupabaseUrl(primary, timeoutMs)) {
    writeCachedUrl(primary);
    return { url: primary, usedFallback: false, reason: 'primary-healthy' };
  }

  if (await probeSupabaseUrl(fallback, timeoutMs)) {
    writeCachedUrl(fallback);
    return { url: fallback, usedFallback: true, reason: 'primary-unreachable' };
  }

  return { url: primary, usedFallback: false, reason: 'both-unreachable' };
}

export function readSupabaseUrlEnvFromVite(): SupabaseUrlEnv {
  return {
    primary: (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '',
    fallback: import.meta.env.VITE_SUPABASE_URL_FALLBACK as string | undefined,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
    projectRef: import.meta.env.VITE_SUPABASE_PROJECT_REF as string | undefined,
  };
}
