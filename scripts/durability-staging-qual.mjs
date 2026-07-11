#!/usr/bin/env node
/**
 * Durability staging qualification gate.
 *
 * Refuses to run against production hosts.
 * Requires STAGING_DATABASE_URL from staging credential files (never root `.env`).
 *
 * Usage:
 *   npm run staging:durability-qual
 *   STAGING_DATABASE_URL=postgres://... node scripts/durability-staging-qual.mjs
 */
import { spawnSync } from 'child_process';
import {
  loadStagingEnv,
  requireStagingIdentity,
  looksLikeProduction,
  STAGING_ROOT,
} from './lib/staging-env.mjs';

const env = loadStagingEnv();
const identity = requireStagingIdentity(env);

console.log('=== Durability staging qualification gate ===');
console.log('STAGING_DATABASE host:', identity.staging.dbHost || '(not set)');
console.log('STAGING_API host:', identity.staging.apiHost || '(not set)');
console.log('STAGING_SUPABASE host:', identity.staging.supabaseHost || '(not set)');
console.log('API_ENV (staging process):', env.API_ENV || 'staging');

if (!identity.ok) {
  console.error('\nNO-GO:', identity.issues.join('; '));
  process.exit(2);
}

const stagingUrl = identity.staging.databaseUrl;
if (!stagingUrl) {
  console.error('\nNO-GO: STAGING_DATABASE_URL is not set.');
  console.error('Refusing to use default DATABASE_URL (may be production).');
  console.error('Isolated local alternative: postgresql://localhost/lorekeeper_staging_qual');
  process.exit(2);
}

if (looksLikeProduction(stagingUrl) || /lorebookai\.com/i.test(stagingUrl)) {
  console.error('\nNO-GO: STAGING_DATABASE_URL looks like production.');
  process.exit(2);
}

console.log('\nStaging URL accepted. Running trust-floor…');
const r = spawnSync('npm', ['run', 'test:trust-floor'], {
  cwd: STAGING_ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: stagingUrl,
    API_ENV: 'staging',
    SUPABASE_URL: env.STAGING_SUPABASE_URL || process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: env.STAGING_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY:
      env.STAGING_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
});
process.exit(r.status ?? 1);
