/**
 * Staging runtime identity assertions.
 *
 * When API_ENV=staging (or RAILWAY_ENVIRONMENT=staging), boot must refuse
 * known production targets. Failures stop startup — no silent fallback.
 *
 * Never logs secrets (keys, passwords, full DB URLs, tokens).
 */

export type StagingIdentityResult =
  | { ok: true; sanitized: StagingSanitizedIdentity }
  | { ok: false; reasons: string[]; sanitized: StagingSanitizedIdentity };

export type StagingSanitizedIdentity = {
  environment: string;
  apiEnv: string;
  railwayEnvironment: string;
  databaseHost: string;
  supabaseHost: string;
  supabaseProject: string;
  service: string;
  commit: string;
};

/** Known production markers — never acceptable for staging boot. */
export const PRODUCTION_IDENTITY_MARKERS = {
  /** Exact hostnames (not substrings — staging.lorebookai.com must be allowed). */
  exactHosts: [
    'supabase.lorebookai.com',
    'lorebookai.com',
    'www.lorebookai.com',
    'cshtthzpgkmrbcsfghyq.supabase.co',
    'lore-book-production.up.railway.app',
  ],
  projectRefs: ['cshtthzpgkmrbcsfghyq'],
  /** Substring markers that are unambiguously production. */
  substrings: [
    'cshtthzpgkmrbcsfghyq',
    'lore-book-production.up.railway.app',
    'supabase.lorebookai.com',
  ],
} as const;

function hostOf(url: string | undefined): string {
  if (!url) return '(unset)';
  try {
    return new URL(url.replace(/^postgresql:/i, 'http:')).hostname;
  } catch {
    return '(unparseable)';
  }
}

function projectRefFromSupabaseUrl(url: string | undefined): string {
  if (!url) return '(unset)';
  try {
    const host = new URL(url).hostname;
    // <ref>.supabase.co
    const m = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    if (m) return m[1];
    return host;
  } catch {
    return '(unparseable)';
  }
}

function containsProductionMarker(value: string): boolean {
  if (!value) return false;
  const s = value.toLowerCase();
  for (const sub of PRODUCTION_IDENTITY_MARKERS.substrings) {
    if (s.includes(sub.toLowerCase())) return true;
  }
  for (const r of PRODUCTION_IDENTITY_MARKERS.projectRefs) {
    if (s.includes(r)) return true;
  }
  // Exact host match against URL-ish values
  try {
    const host = new URL(value.replace(/^postgresql:/i, 'http:')).hostname.toLowerCase();
    if ((PRODUCTION_IDENTITY_MARKERS.exactHosts as readonly string[]).includes(host)) {
      return true;
    }
  } catch {
    // bare host
    if ((PRODUCTION_IDENTITY_MARKERS.exactHosts as readonly string[]).includes(s)) {
      return true;
    }
  }
  return false;
}

/**
 * True when this process claims to be staging (explicit only).
 * A command-line flag or mis-set NODE_ENV alone must not claim staging
 * while still using production hosts — identity is asserted separately.
 */
export function isStagingRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  const apiEnv = (env.API_ENV ?? '').toLowerCase();
  const railwayEnv = (env.RAILWAY_ENVIRONMENT ?? env.RAILWAY_ENVIRONMENT_NAME ?? '').toLowerCase();
  return apiEnv === 'staging' || railwayEnv === 'staging';
}

export function buildSanitizedIdentity(
  env: NodeJS.ProcessEnv = process.env
): StagingSanitizedIdentity {
  const apiEnv = env.API_ENV ?? '(unset)';
  const railwayEnv = env.RAILWAY_ENVIRONMENT ?? env.RAILWAY_ENVIRONMENT_NAME ?? '(unset)';
  return {
    environment: apiEnv === 'staging' || railwayEnv.toLowerCase() === 'staging' ? 'staging' : apiEnv,
    apiEnv,
    railwayEnvironment: railwayEnv,
    databaseHost: hostOf(env.DATABASE_URL || env.STAGING_DATABASE_URL),
    supabaseHost: hostOf(env.SUPABASE_URL || env.STAGING_SUPABASE_URL),
    supabaseProject: projectRefFromSupabaseUrl(env.SUPABASE_URL || env.STAGING_SUPABASE_URL),
    service: env.RAILWAY_SERVICE_NAME ?? env.SERVICE_NAME ?? 'lorekeeper-api',
    commit:
      env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 12) ||
      env.GITHUB_SHA?.slice(0, 12) ||
      env.COMMIT_SHA?.slice(0, 12) ||
      '(unknown)',
  };
}

/**
 * Assert staging identity when running as staging.
 * Returns ok:true for non-staging runtimes (no-op).
 * For staging: requires vars and rejects production markers.
 *
 * Production detection cannot be overridden by a CLI flag.
 */
export function assertStagingIdentity(
  env: NodeJS.ProcessEnv = process.env
): StagingIdentityResult {
  const sanitized = buildSanitizedIdentity(env);
  if (!isStagingRuntime(env)) {
    return { ok: true, sanitized };
  }

  const reasons: string[] = [];
  const apiEnv = (env.API_ENV ?? '').toLowerCase();
  const railwayEnv = (env.RAILWAY_ENVIRONMENT ?? '').toLowerCase();

  if (apiEnv !== 'staging') {
    reasons.push(`API_ENV must be "staging" (got "${env.API_ENV ?? ''}")`);
  }

  // Railway platform env name should be staging when present
  if (railwayEnv && railwayEnv !== 'staging') {
    reasons.push(
      `RAILWAY_ENVIRONMENT must be "staging" when set (got "${env.RAILWAY_ENVIRONMENT}")`
    );
  }

  const supabaseUrl = (env.SUPABASE_URL || env.STAGING_SUPABASE_URL || '').trim();
  const databaseUrl = (env.DATABASE_URL || env.STAGING_DATABASE_URL || '').trim();
  const anon = env.SUPABASE_ANON_KEY || env.STAGING_SUPABASE_ANON_KEY || '';
  const serviceRole =
    env.SUPABASE_SERVICE_ROLE_KEY || env.STAGING_SUPABASE_SERVICE_ROLE_KEY || '';
  const openAi = env.OPENAI_API_KEY || '';

  if (!supabaseUrl) reasons.push('SUPABASE_URL (or STAGING_SUPABASE_URL) is required');
  if (!databaseUrl) reasons.push('DATABASE_URL (or STAGING_DATABASE_URL) is required');
  if (!anon) reasons.push('SUPABASE_ANON_KEY is required');
  if (!serviceRole) reasons.push('SUPABASE_SERVICE_ROLE_KEY is required');
  if (!openAi) reasons.push('OPENAI_API_KEY is required');

  if (containsProductionMarker(supabaseUrl)) {
    reasons.push('production Supabase project detected in SUPABASE_URL');
  }
  if (containsProductionMarker(databaseUrl)) {
    reasons.push('production database detected in DATABASE_URL');
  }
  if (containsProductionMarker(env.FRONTEND_URL || '')) {
    reasons.push('FRONTEND_URL points at production host (lorebookai.com)');
  }
  if (containsProductionMarker(env.MCP_WEB_APP_URL || '')) {
    reasons.push('MCP_WEB_APP_URL points at production');
  }

  // Explicit railway production name is never staging
  if (railwayEnv === 'production' || railwayEnv === 'prod') {
    reasons.push('production Railway environment detected');
  }

  // Fault injection must not be forced on via random request headers — env only.
  // Soft warn is not enough for "true" on staging with production markers already caught.
  // Staging may enable fault injection intentionally for qual; that is env-gated only.

  if (reasons.length) {
    return { ok: false, reasons, sanitized };
  }
  return { ok: true, sanitized };
}

/** Format one-line sanitized boot identity for logs. */
export function formatSanitizedIdentityLog(id: StagingSanitizedIdentity): string {
  return [
    `environment=${id.environment}`,
    `databaseHost=${id.databaseHost}`,
    `supabaseProject=${id.supabaseProject}`,
    `service=${id.service}`,
    `commit=${id.commit}`,
  ].join(' ');
}
