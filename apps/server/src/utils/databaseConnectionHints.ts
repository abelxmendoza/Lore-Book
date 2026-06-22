/**
 * O(1) checks on DATABASE_URL for Supabase SSL enforcement readiness.
 * See: https://supabase.com/docs/guides/platform/ssl-enforcement
 */

export type DatabaseConnectionHints = {
  databaseUrlConfigured: boolean;
  sslMode: string | null;
  /** True when sslmode is require, verify-ca, or verify-full (safe if SSL enforcement is on). */
  sslEnforcementReady: boolean;
};

const SSL_READY_MODES = new Set(['require', 'verify-ca', 'verify-full']);

export function resolveDatabaseConnectionHints(
  env: NodeJS.ProcessEnv = process.env
): DatabaseConnectionHints {
  const raw = env.DATABASE_URL?.trim();
  if (!raw) {
    return { databaseUrlConfigured: false, sslMode: null, sslEnforcementReady: false };
  }

  try {
    const url = new URL(raw);
    const sslMode = url.searchParams.get('sslmode')?.toLowerCase() ?? null;
    return {
      databaseUrlConfigured: true,
      sslMode,
      sslEnforcementReady: sslMode !== null && SSL_READY_MODES.has(sslMode),
    };
  } catch {
    return { databaseUrlConfigured: true, sslMode: null, sslEnforcementReady: false };
  }
}
