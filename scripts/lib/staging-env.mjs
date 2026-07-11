/**
 * Staging-only environment loader.
 *
 * Never loads root `.env` (which may target production).
 * Loads, in order (later overrides earlier):
 *   1. process.env
 *   2. .env.staging.example is NOT loaded (template only)
 *   3. .env.staging (optional committed-safe placeholders — prefer local)
 *   4. .env.staging.local
 *   5. apps/server/.env.staging.local
 *   6. .private/staging-credentials.env
 *
 * Staging scripts must use this module instead of dotenv on `.env`.
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

export const STAGING_ROOT = root;

/** Known production identity markers — hard reject if present in staging targets. */
export const PRODUCTION_MARKERS = {
  /** Exact hostnames only (staging.lorebookai.com is allowed). */
  exactHosts: [
    'supabase.lorebookai.com',
    'lorebookai.com',
    'www.lorebookai.com',
    'cshtthzpgkmrbcsfghyq.supabase.co',
    'lore-book-production.up.railway.app',
  ],
  /** Unambiguous production substrings */
  substrings: [
    'cshtthzpgkmrbcsfghyq',
    'supabase.lorebookai.com',
    'lore-book-production.up.railway.app',
  ],
  projectRefs: ['cshtthzpgkmrbcsfghyq'],
  envValues: ['production'],
};

export function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

/**
 * Load staging credential sources only (never root `.env`).
 * process.env always wins.
 */
export function loadStagingEnv() {
  const files = [
    join(root, '.env.staging'),
    join(root, '.env.staging.local'),
    join(root, 'apps/server/.env.staging.local'),
    join(root, 'apps/web/.env.staging.local'),
    join(root, '.private/staging-credentials.env'),
  ];
  let merged = {};
  for (const f of files) {
    merged = { ...merged, ...loadEnvFile(f) };
  }
  // process.env wins only when non-empty — empty shell exports must not
  // blank out values loaded from staging credential files.
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && v !== '') merged[k] = v;
  }
  return merged;
}

export function hostOf(url) {
  if (!url) return null;
  try {
    return new URL(url.replace(/^postgresql:/i, 'http:')).hostname;
  } catch {
    return '(unparseable)';
  }
}

export function looksLikeProduction(value) {
  if (!value) return false;
  const s = String(value).toLowerCase();
  if (PRODUCTION_MARKERS.substrings.some((h) => s.includes(h.toLowerCase()))) return true;
  if (PRODUCTION_MARKERS.projectRefs.some((r) => s.includes(r))) return true;
  if (/\bapi_env\s*=\s*production\b/i.test(s)) return true;
  try {
    const host = new URL(String(value).replace(/^postgresql:/i, 'http:')).hostname.toLowerCase();
    if (PRODUCTION_MARKERS.exactHosts.includes(host)) return true;
  } catch {
    if (PRODUCTION_MARKERS.exactHosts.includes(s)) return true;
  }
  return false;
}

export function requireStagingIdentity(env) {
  const db =
    env.STAGING_DATABASE_URL ||
    env.LOREKEEPER_STAGING_DATABASE_URL ||
    '';
  const api = env.STAGING_API_URL || env.LOREKEEPER_STAGING_API_URL || '';
  const supa = env.STAGING_SUPABASE_URL || '';
  const ref = env.STAGING_SUPABASE_PROJECT_REF || '';
  const apiEnv = (env.API_ENV || '').toLowerCase();

  const issues = [];

  if (!db && !api && !supa) {
    issues.push('No STAGING_DATABASE_URL, STAGING_API_URL, or STAGING_SUPABASE_URL configured');
  }

  for (const [label, val] of [
    ['STAGING_DATABASE_URL', db],
    ['STAGING_API_URL', api],
    ['STAGING_SUPABASE_URL', supa],
    ['STAGING_SUPABASE_PROJECT_REF', ref],
  ]) {
    if (val && looksLikeProduction(val)) {
      issues.push(`${label} matches known production identity`);
    }
  }

  if (apiEnv === 'production') {
    issues.push('API_ENV=production is not allowed for staging operations');
  }

  if (ref && PRODUCTION_MARKERS.projectRefs.includes(ref)) {
    issues.push('STAGING_SUPABASE_PROJECT_REF is the production project ref');
  }

  // Staging DB host must not be production host
  const dbHost = hostOf(db);
  if (
    dbHost &&
    (PRODUCTION_MARKERS.exactHosts.includes(dbHost.toLowerCase()) ||
      PRODUCTION_MARKERS.substrings.some((s) => dbHost.toLowerCase().includes(s.toLowerCase())))
  ) {
    issues.push('Staging database host is a production host');
  }

  return {
    ok: issues.length === 0,
    issues,
    staging: {
      databaseUrl: db,
      apiUrl: api,
      supabaseUrl: supa,
      projectRef: ref,
      apiEnv: apiEnv || 'staging',
      dbHost,
      supabaseHost: hostOf(supa),
      apiHost: hostOf(api),
    },
  };
}

export function sanitizeUrl(url) {
  if (!url) return '(unset)';
  try {
    const u = new URL(url.replace(/^postgresql:/i, 'http:'));
    return u.hostname + (u.port ? `:${u.port}` : '') + u.pathname.replace(/\/$/, '');
  } catch {
    return '(unparseable)';
  }
}
