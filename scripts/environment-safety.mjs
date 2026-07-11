#!/usr/bin/env node
/**
 * Environment safety preflight — refuse production targets for qualification.
 *
 * Usage: npm run test:environment-safety
 * Exit 0 = safe for staging qualification (STAGING_* present, not prod)
 * Exit 2 = NO-GO (production signals or missing staging)
 *
 * Loads ONLY staging credential files (never root `.env`).
 */
import {
  loadStagingEnv,
  hostOf,
  requireStagingIdentity,
  looksLikeProduction,
  sanitizeUrl,
} from './lib/staging-env.mjs';

const env = loadStagingEnv();
const identity = requireStagingIdentity(env);

const stagingDb = identity.staging.databaseUrl;
const stagingApi = identity.staging.apiUrl;
const stagingSupa = identity.staging.supabaseUrl;
const ref = identity.staging.projectRef;
const apiEnv = (env.API_ENV || 'staging').toLowerCase();

console.log('=== Environment safety preflight ===');
console.log('Environment:', apiEnv === 'staging' || !env.API_ENV ? 'staging' : apiEnv);
console.log('STAGING_SUPABASE_HOST:', identity.staging.supabaseHost || '(unset)');
console.log('STAGING_DATABASE_HOST:', identity.staging.dbHost || '(NOT SET)');
console.log('STAGING_API_HOST:', identity.staging.apiHost || '(NOT SET)');
console.log('STAGING_PROJECT_REF:', ref ? `${ref.slice(0, 4)}…${ref.slice(-4)}` : '(unset)');
console.log(
  'Production Supabase detected:',
  looksLikeProduction(stagingSupa) || looksLikeProduction(ref),
);
console.log(
  'Production database detected:',
  looksLikeProduction(stagingDb),
);
console.log(
  'Production Railway environment detected:',
  /production/i.test(env.RAILWAY_ENVIRONMENT || '') ||
    /lore-book-production/i.test(stagingApi || ''),
);

if (!identity.ok) {
  console.error('\nNO-GO: Staging identity check failed:');
  for (const issue of identity.issues) {
    console.error('  -', issue);
  }
  console.error(
    'Configure .private/staging-credentials.env or .env.staging.local (never root .env).',
  );
  process.exit(2);
}

if (!stagingDb && !stagingApi) {
  console.error('\nNO-GO: No STAGING_DATABASE_URL or STAGING_API_URL configured.');
  console.error('Refusing to use default DATABASE_URL (may be production).');
  process.exit(2);
}

// Extra guard: never accept production project ref even as substring
const blob = `${stagingDb}\n${stagingApi}\n${stagingSupa}\n${ref}`;
if (/cshtthzpgkmrbcsfghyq/i.test(blob) || /supabase\.lorebookai\.com/i.test(blob)) {
  console.error('\nNO-GO: Production Supabase identity present in staging config.');
  process.exit(2);
}

console.log('\nOK: Staging target present and does not match production signals.');
console.log('Staging database:', sanitizeUrl(stagingDb));
console.log('Staging API:', sanitizeUrl(stagingApi));
process.exit(0);
