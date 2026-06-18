#!/usr/bin/env node
/**
 * Synthetic health smoke check.
 *
 * Polls a deployment's /api/health endpoint and exits non-zero if it does not
 * return HTTP 200 within the retry budget. Optionally verifies the CORS
 * Access-Control-Allow-Origin header for a given origin.
 *
 * This is the regression guard for the 2026-06-18 outage, where Railway's edge
 * returned 502 because the public domain target port (8080) did not match the
 * app's PORT (4000). A green deploy with a red /api/health is exactly what this
 * catches — in CI post-deploy and on a schedule.
 *
 * Usage:
 *   node scripts/smoke-health.mjs <base-url> [--origin <origin>] [--attempts N] [--interval-ms N] [--timeout-ms N]
 *
 * Env fallbacks:
 *   HEALTH_URL      base url (e.g. https://lore-book-production.up.railway.app)
 *   HEALTH_ORIGIN   origin to verify CORS for (e.g. https://lorebookai.com)
 *   HEALTH_ATTEMPTS, HEALTH_INTERVAL_MS, HEALTH_TIMEOUT_MS
 *
 * Examples:
 *   node scripts/smoke-health.mjs https://lore-book-production.up.railway.app
 *   HEALTH_URL=https://lorebookai.com node scripts/smoke-health.mjs --origin https://lorebookai.com
 */

function parseArgs(argv) {
  const args = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--origin') args.origin = argv[++i];
    else if (a === '--attempts') args.attempts = Number(argv[++i]);
    else if (a === '--interval-ms') args.intervalMs = Number(argv[++i]);
    else if (a === '--timeout-ms') args.timeoutMs = Number(argv[++i]);
    else args.positional.push(a);
  }
  return args;
}

function resolveHealthUrl(base) {
  const trimmed = base.replace(/\/+$/, '');
  return /\/api\/health$/.test(trimmed) ? trimmed : `${trimmed}/api/health`;
}

function resolveDbHealthUrl(base) {
  const trimmed = base.replace(/\/+$/, '').replace(/\/api\/health$/, '');
  return `${trimmed}/api/health/db`;
}

/** After liveness passes, verify schema is not degraded (503 guard would block all API routes). */
async function assertDbSchemaHealthy(base, timeoutMs) {
  const dbUrl = resolveDbHealthUrl(base);
  const res = await fetch(dbUrl, {
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  });
  if (res.status !== 200) {
    throw new Error(`DB schema probe returned HTTP ${res.status} (${dbUrl})`);
  }
  const payload = await res.json().catch(() => ({}));
  if (payload.status === 'degraded') {
    const missing = Array.isArray(payload.missingTables) ? payload.missingTables.join(', ') : 'unknown';
    throw new Error(
      `Database schema degraded (missing: ${missing}). Run: npm run migrate:engine`,
    );
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const base = args.positional[0] || process.env.HEALTH_URL;

  if (!base) {
    console.error('❌ No URL provided. Pass a base URL or set HEALTH_URL.');
    console.error('   Usage: node scripts/smoke-health.mjs <base-url> [--origin <origin>]');
    process.exit(2);
  }

  const url = resolveHealthUrl(base);
  const origin = args.origin || process.env.HEALTH_ORIGIN;
  const attempts = args.attempts || Number(process.env.HEALTH_ATTEMPTS) || 20;
  const intervalMs = args.intervalMs || Number(process.env.HEALTH_INTERVAL_MS) || 10_000;
  const timeoutMs = args.timeoutMs || Number(process.env.HEALTH_TIMEOUT_MS) || 10_000;

  console.log(`🔎 Smoke-checking ${url}`);
  console.log(`   attempts=${attempts} interval=${intervalMs}ms timeout=${timeoutMs}ms${origin ? ` origin=${origin}` : ''}`);

  let lastError = 'unknown';

  for (let i = 1; i <= attempts; i++) {
    try {
      const headers = origin ? { Origin: origin } : {};
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
        cache: 'no-store',
      });

      if (res.status === 200) {
        let body = '';
        try {
          body = await res.text();
        } catch {
          /* ignore body read errors */
        }

        // Optional CORS assertion
        if (origin) {
          const acao = res.headers.get('access-control-allow-origin');
          if (acao !== origin && acao !== '*') {
            lastError = `200 OK but missing/incorrect Access-Control-Allow-Origin (got "${acao ?? 'none'}", expected "${origin}")`;
            console.warn(`   attempt ${i}/${attempts}: ${lastError}`);
            await sleep(intervalMs);
            continue;
          }
        }

        console.log(`✅ Healthy (HTTP 200) on attempt ${i}/${attempts}`);
        if (body) console.log(`   body: ${body.slice(0, 300)}`);

        try {
          await assertDbSchemaHealthy(base, timeoutMs);
          console.log('✅ DB schema OK (/api/health/db)');
        } catch (schemaErr) {
          lastError = schemaErr?.message || String(schemaErr);
          console.warn(`   attempt ${i}/${attempts}: ${lastError}`);
          await sleep(intervalMs);
          continue;
        }

        process.exit(0);
      }

      lastError = `HTTP ${res.status}`;
      console.warn(`   attempt ${i}/${attempts}: ${lastError}`);
    } catch (err) {
      lastError = err?.name === 'TimeoutError' ? 'request timed out' : (err?.message || String(err));
      console.warn(`   attempt ${i}/${attempts}: ${lastError}`);
    }

    if (i < attempts) await sleep(intervalMs);
  }

  console.error(`❌ Health check FAILED after ${attempts} attempts. Last error: ${lastError}`);
  console.error(`   URL: ${url}`);
  console.error('   If this is a Railway 502 "Application failed to respond", verify the');
  console.error('   public domain Target port matches the PORT env var (railway domain).');
  console.error('   If liveness passed but schema failed, run: npm run migrate:engine');
  process.exit(1);
}

main().catch((err) => {
  console.error('❌ Unexpected smoke-check error:', err);
  process.exit(1);
});
