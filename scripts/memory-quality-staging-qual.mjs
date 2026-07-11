#!/usr/bin/env node
/**
 * Memory Quality v2 staging qualification gate.
 *
 * Refuses production hosts. Requires STAGING_DATABASE_URL from staging credential files.
 * Does not load root `.env` for staging identity.
 *
 * Usage:
 *   npm run staging:memory-quality-qual
 */
import { spawnSync } from 'child_process';
import {
  loadStagingEnv,
  requireStagingIdentity,
  looksLikeProduction,
  hostOf,
  STAGING_ROOT,
} from './lib/staging-env.mjs';

const env = loadStagingEnv();
const identity = requireStagingIdentity(env);

console.log('=== Memory Quality v2 staging qualification gate ===');
console.log('STAGING_DATABASE host:', identity.staging.dbHost || '(not set)');
console.log('STAGING_API host:', identity.staging.apiHost || '(not set)');
console.log('STAGING_SUPABASE host:', identity.staging.supabaseHost || '(not set)');

if (!identity.ok) {
  console.error('\nNO-GO:', identity.issues.join('; '));
  process.exit(2);
}

const stagingUrl = identity.staging.databaseUrl;
if (!stagingUrl) {
  console.error('\nNO-GO: STAGING_DATABASE_URL is not set.');
  process.exit(2);
}
if (looksLikeProduction(stagingUrl)) {
  console.error('\nNO-GO: STAGING_DATABASE_URL looks like production.');
  process.exit(2);
}

console.log('\nStaging URL accepted. Running test:memory-quality…');
const r = spawnSync('npm', ['run', 'test:memory-quality'], {
  cwd: STAGING_ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: stagingUrl,
    API_ENV: 'staging',
    // Prefer staging Supabase for any runtime checks
    SUPABASE_URL: env.STAGING_SUPABASE_URL || process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: env.STAGING_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY:
      env.STAGING_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
});
process.exit(r.status ?? 1);
