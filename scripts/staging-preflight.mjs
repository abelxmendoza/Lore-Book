#!/usr/bin/env node
/**
 * Full staging environment preflight.
 *
 * Usage: npm run staging:preflight
 * Exit 0 = qualification allowed
 * Exit 2 = NO-GO
 *
 * Never loads root `.env`. Never prints secrets.
 */
import { spawnSync } from 'child_process';
import {
  loadStagingEnv,
  hostOf,
  requireStagingIdentity,
  looksLikeProduction,
  sanitizeUrl,
  STAGING_ROOT,
} from './lib/staging-env.mjs';

const env = loadStagingEnv();
const identity = requireStagingIdentity(env);

function bool(v) {
  return v ? 'true' : 'false';
}

async function httpOk(url, headers = {}, timeoutMs = 8000) {
  if (!url) return false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { headers, signal: ctrl.signal });
    clearTimeout(t);
    return res.ok || res.status === 401 || res.status === 404;
  } catch {
    return false;
  }
}

async function main() {
  console.log('=== Staging preflight ===');

  if (!identity.ok) {
    console.error('NO-GO: identity check failed');
    for (const i of identity.issues) console.error(' -', i);
    process.exit(2);
  }

  const {
    databaseUrl,
    apiUrl,
    supabaseUrl,
    projectRef,
    dbHost,
    supabaseHost,
    apiHost,
  } = identity.staging;

  const prodSupa =
    looksLikeProduction(supabaseUrl) ||
    looksLikeProduction(projectRef) ||
    /cshtthzpgkmrbcsfghyq/i.test(`${supabaseUrl}${projectRef}`);
  const prodDb = looksLikeProduction(databaseUrl);
  const prodRailway =
    /production/i.test(env.RAILWAY_ENVIRONMENT || '') ||
    /lore-book-production/i.test(apiUrl || '');

  if (prodSupa || prodDb || prodRailway) {
    console.log('Environment: staging');
    console.log('Production Supabase detected:', bool(prodSupa));
    console.log('Production database detected:', bool(prodDb));
    console.log('Production Railway environment detected:', bool(prodRailway));
    console.error('\nNO-GO: production signal detected — aborting.');
    process.exit(2);
  }

  // Force API_ENV=staging for this process identity report
  const reportEnv = env.API_ENV || 'staging';
  if (String(reportEnv).toLowerCase() === 'production') {
    console.error('NO-GO: API_ENV=production');
    process.exit(2);
  }

  // DB reachability via psql (sanitized)
  let dbReachable = false;
  if (databaseUrl) {
    const r = spawnSync(
      'psql',
      [databaseUrl, '-tAc', 'SELECT 1'],
      { encoding: 'utf8', timeout: 15000 },
    );
    dbReachable = r.status === 0 && String(r.stdout).trim() === '1';
  }

  // Auth reachability
  const anon = env.STAGING_SUPABASE_ANON_KEY || '';
  let authReachable = false;
  if (supabaseUrl && anon) {
    authReachable = await httpOk(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/health`, {
      apikey: anon,
    });
  }

  // API reachability (may be false until Railway staging exists)
  let apiReachable = false;
  if (apiUrl) {
    apiReachable = await httpOk(`${apiUrl.replace(/\/$/, '')}/api/health`);
  }

  // Qualification requires DB + Auth + no prod. API optional for migrate-only,
  // but full hosted qual needs API.
  const qualificationAllowed = !prodSupa && !prodDb && !prodRailway && dbReachable && authReachable;

  console.log('Environment: staging');
  console.log('Production Supabase detected:', bool(prodSupa));
  console.log('Production database detected:', bool(prodDb));
  console.log('Production Railway environment detected:', bool(prodRailway));
  console.log('Staging API reachable:', bool(apiReachable));
  console.log('Staging database reachable:', bool(dbReachable));
  console.log('Staging Auth reachable:', bool(authReachable));
  console.log('Qualification allowed:', bool(qualificationAllowed && apiReachable));
  console.log('');
  console.log('Sanitized targets:');
  console.log('  supabase:', sanitizeUrl(supabaseUrl), supabaseHost || '');
  console.log('  database:', dbHost || '(unset)');
  console.log('  api:', apiHost || '(unset)');
  console.log('  project_ref_suffix:', projectRef ? projectRef.slice(-6) : '(unset)');
  console.log('  STAGING_APP_URL:', env.STAGING_APP_URL ? hostOf(env.STAGING_APP_URL) : '(unset)');
  console.log('  test_user_configured:', bool(!!env.STAGING_TEST_USER_EMAIL));

  if (!dbReachable) {
    console.error('\nNO-GO: staging database not reachable');
    process.exit(2);
  }
  if (!authReachable) {
    console.error('\nNO-GO: staging Auth not reachable');
    process.exit(2);
  }
  if (!apiReachable) {
    console.error('\nNO-GO: staging API not reachable (Railway staging not provisioned?)');
    console.error('Database + Auth are healthy; provision staging API then re-run.');
    process.exit(2);
  }

  console.log('\nOK: staging preflight passed.');
  process.exit(0);
}

main().catch((e) => {
  console.error('NO-GO: preflight crashed:', e?.message || e);
  process.exit(2);
});
