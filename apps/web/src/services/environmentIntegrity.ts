/**
 * EnvironmentIntegrityService
 *
 * Boot-time validation of environment variables and API connectivity.
 * Runs once when the app starts. Surfaces actionable warnings in the console
 * so deployment misconfigurations are visible immediately.
 *
 * Checks:
 *   - Required env vars present (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
 *   - VITE_API_URL set in production when mock data is disabled
 *   - No localhost URL leakage in production builds
 *   - API /health reachable
 *
 * Usage:
 *   environmentIntegrity.run();  // call once from main.tsx
 */

import { runtimeDiagnostics } from '../features/chat/services/runtimeDiagnostics';
import { checkBackendHealth, describeBackendHealthFailure, type BackendHealthResult } from '../lib/backendHealth';

interface EnvCheckResult {
  variable: string;
  present: boolean;
  /** Partial value for logging — never log full tokens */
  preview?: string;
}

interface IntegrityReport {
  ok: boolean;
  checks: EnvCheckResult[];
  apiHealth: 'ok' | 'fail' | 'skip';
  apiHealthDetail?: BackendHealthResult;
  warnings: string[];
  errors: string[];
}

// One run per page load
let didRun = false;
let cachedReport: IntegrityReport | null = null;

function preview(val: string | undefined, len = 12): string | undefined {
  if (!val) return undefined;
  return val.length <= len ? val : `${val.slice(0, len)}…`;
}

async function runIntegrityCheck(): Promise<IntegrityReport> {
  if (didRun && cachedReport) return cachedReport;
  didRun = true;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  const useMockData = (import.meta.env.VITE_USE_MOCK_DATA as string | undefined) ?? 'true';
  const isProduction = import.meta.env.PROD === true;

  const warnings: string[] = [];
  const errors: string[] = [];

  const checks: EnvCheckResult[] = [
    { variable: 'VITE_SUPABASE_URL', present: !!supabaseUrl, preview: preview(supabaseUrl, 30) },
    { variable: 'VITE_SUPABASE_ANON_KEY', present: !!supabaseKey, preview: preview(supabaseKey) },
    { variable: 'VITE_API_URL', present: !!apiUrl, preview: apiUrl },
    { variable: 'VITE_USE_MOCK_DATA', present: true, preview: useMockData },
  ];

  // ── URL format checks ────────────────────────────────────────────────────────
  if (supabaseUrl && !supabaseUrl.startsWith('https://')) {
    errors.push(`VITE_SUPABASE_URL must start with https:// — got: "${supabaseUrl.slice(0, 40)}"`);
    runtimeDiagnostics.record('env_error', { meta: { check: 'supabase_url_format' } });
  }

  // ── Production-only checks ───────────────────────────────────────────────────
  if (isProduction) {
    if (supabaseUrl?.includes('localhost') || supabaseUrl?.includes('127.0.0.1')) {
      errors.push('VITE_SUPABASE_URL contains localhost in a production build — auth will fail.');
      runtimeDiagnostics.record('env_error', { meta: { check: 'supabase_url_localhost_leak' } });
    }
    if (apiUrl?.includes('localhost') || apiUrl?.includes('127.0.0.1')) {
      errors.push('VITE_API_URL contains localhost in a production build — API calls will fail.');
      runtimeDiagnostics.record('env_error', { meta: { check: 'api_url_localhost_leak' } });
    }
    // Always error when VITE_API_URL is missing in production — regardless of mock flag.
    // Without it, every /api/* call resolves to the Vercel frontend origin and gets HTML back.
    if (!apiUrl) {
      const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'the frontend origin';
      errors.push(
        `VITE_API_URL is not set. All API calls will hit ${currentOrigin} (Vercel) instead of Railway. ` +
        'Vercel Dashboard → Project → Settings → Environment Variables: ' +
        'VITE_API_URL = https://lore-book-production.up.railway.app, then redeploy.'
      );
      runtimeDiagnostics.record('env_error', { meta: { check: 'api_url_missing_production' } });
    } else if (typeof window !== 'undefined') {
      // Same-origin assertion: if the configured URL resolves to THIS origin, it's wrong.
      try {
        const resolvedOrigin = new URL(apiUrl).origin;
        if (resolvedOrigin === window.location.origin) {
          errors.push(
            `VITE_API_URL resolves to the frontend origin (${resolvedOrigin}). ` +
            'All API calls will hit Vercel and return HTML instead of JSON. ' +
            'Set VITE_API_URL to the Railway backend URL, not the Vercel URL.'
          );
          runtimeDiagnostics.record('env_error', { meta: { check: 'api_url_same_origin' } });
        }
      } catch {
        errors.push(`VITE_API_URL is not a valid URL: "${apiUrl}"`);
        runtimeDiagnostics.record('env_error', { meta: { check: 'api_url_invalid' } });
      }
    }
    if (!supabaseUrl || !supabaseKey) {
      if (useMockData === 'false') {
        errors.push(
          'Missing Supabase credentials in production. ' +
          'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel.'
        );
        runtimeDiagnostics.record('env_error', { meta: { check: 'supabase_creds_missing' } });
      }
    }
  }

  // ── API health check ─────────────────────────────────────────────────────────
  let apiHealth: 'ok' | 'fail' | 'skip' = 'skip';
  let apiHealthDetail: BackendHealthResult | undefined;
  const apiBase = apiUrl ?? '';

  // Only ping health if we have an explicit URL, or we're in dev (proxy handles it)
  const shouldPingHealth = !!apiBase || !isProduction;
  if (shouldPingHealth) {
    const health = await checkBackendHealth(apiBase, { timeoutMs: 5000 });
    apiHealthDetail = health;
    if (health.ok) {
      apiHealth = 'ok';
      runtimeDiagnostics.record('api_health_ok', {
        meta: { status: health.status, url: health.url },
      });
    } else {
      apiHealth = 'fail';
      runtimeDiagnostics.record('api_health_fail', {
        meta: {
          reason: health.kind,
          status: health.status,
          url: health.url,
          message: health.message,
        },
      });
      if (isProduction && useMockData === 'false') {
        warnings.push(
          `${describeBackendHealthFailure(health)} ` +
          'Confirm the backend deployment is running and VITE_API_URL points to it.'
        );
      }
    }
  }

  const ok = errors.length === 0;
  const report: IntegrityReport = { ok, checks, apiHealth, apiHealthDetail, warnings, errors };
  cachedReport = report;

  logReport(report);
  return report;
}

function logReport(report: IntegrityReport): void {
  const isDev = import.meta.env.DEV === true;

  if (report.errors.length > 0) {
    console.group('❌ [LoreBook] Environment configuration errors');
    report.errors.forEach((e) => console.error(' ', e));
    console.groupEnd();
  }

  if (report.warnings.length > 0) {
    console.group('⚠️  [LoreBook] Environment warnings');
    report.warnings.forEach((w) => console.warn(' ', w));
    console.groupEnd();
  }

  if (isDev) {
    console.groupCollapsed('[LoreBook] Environment check');
    console.table(
      report.checks.map((c) => ({
        Variable: c.variable,
        Present: c.present ? '✅' : '❌',
        Value: c.preview ?? '—',
      }))
    );
    console.log('API Health:', report.apiHealth === 'ok' ? '✅ ok' : report.apiHealth === 'fail' ? '❌ fail' : '⏭ skipped');
    console.groupEnd();
  }
}

/**
 * Run the environment integrity check once.
 * Safe to call multiple times — only executes once per page load.
 */
export function runEnvironmentCheck(): void {
  // Fire-and-forget — warnings surface via console; errors don't block the app
  runIntegrityCheck().catch(() => {});
}

/** For tests and debug panels — get the last integrity report. */
export function getIntegrityReport(): IntegrityReport | null {
  return cachedReport;
}
