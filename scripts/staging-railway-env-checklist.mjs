#!/usr/bin/env node
/**
 * Print the exact Railway staging variable matrix (keys only) from staging credentials.
 * Does not print secret values. Does not mutate Railway.
 *
 * Usage: node scripts/staging-railway-env-checklist.mjs
 */
import {
  loadStagingEnv,
  requireStagingIdentity,
  hostOf,
  looksLikeProduction,
} from './lib/staging-env.mjs';

const env = loadStagingEnv();
const identity = requireStagingIdentity(env);

console.log('=== Railway staging variable checklist (no secrets) ===\n');

if (!identity.ok) {
  console.error('Staging credentials invalid:');
  for (const i of identity.issues) console.error(' -', i);
  process.exit(2);
}

const required = [
  ['API_ENV', 'staging'],
  ['NODE_ENV', 'production'],
  ['RAILWAY_ENVIRONMENT', 'staging (platform-set when env name is staging)'],
  ['DATABASE_URL', 'staging Postgres (direct or pooler)'],
  ['STAGING_DATABASE_URL', 'same as DATABASE_URL if scripts require it'],
  ['SUPABASE_URL', 'https://madyqnyvlexmpphejqmh.supabase.co'],
  ['SUPABASE_ANON_KEY', 'staging anon'],
  ['SUPABASE_SERVICE_ROLE_KEY', 'staging service-role'],
  ['OPENAI_API_KEY', 'staging/budget key'],
  ['SENTRY_ENVIRONMENT', 'staging'],
  ['DURABILITY_FAULT_INJECTION', 'unset or false (default)'],
  ['FRONTEND_URL', 'staging web origin (not lorebookai.com prod)'],
  ['PORT', 'platform-injected (do not hardcode production-only port)'],
  ['ENABLE_ENGINE_SCHEDULER', 'false'],
  ['ENABLE_GROUP_DETECTION', 'false'],
  ['ENABLE_MCP', 'false (unless intentionally testing MCP on staging)'],
  ['MONTHLY_OPENAI_BUDGET_USD', 'low budget cap recommended'],
];

const safeShared = [
  'OPENAI_CHAT_MODEL',
  'OPENAI_EXTRACTION_MODEL',
  'OPENAI_NANO_MODEL',
  'OPENAI_EMBEDDING_MODEL',
  'OPENAI_MODEL',
  'OPENAI_API_MODEL',
  'ENABLE_MERGED_EXTRACTION',
  'ENABLE_SHADOW_EXTRACTION',
];

console.log('Required (replace every secret from .private/staging-credentials.env):\n');
for (const [k, note] of required) {
  console.log(`  ${k.padEnd(32)} ${note}`);
}

console.log('\nSafe non-secret shared config (may copy from production deliberately):\n');
for (const k of safeShared) {
  console.log(`  ${k}`);
}

console.log('\nDo NOT copy from production:\n');
console.log('  DATABASE_URL, SUPABASE_*, OPENAI_API_KEY (prefer separate budget key),');
console.log('  STRIPE_*, MCP_OAUTH_JWT_SECRET, FRONTEND_URL=lorebookai.com,');
console.log('  ADMIN/OWNER IDs if they grant production privileges,');
console.log('  any VITE_* service-role or database credentials');

console.log('\nLocal credential status (sanitized):');
console.log('  supabase host:', identity.staging.supabaseHost);
console.log('  database host:', identity.staging.dbHost);
console.log('  project ref set:', Boolean(env.STAGING_SUPABASE_PROJECT_REF));
console.log('  anon key set:', Boolean(env.STAGING_SUPABASE_ANON_KEY));
console.log('  service role set:', Boolean(env.STAGING_SUPABASE_SERVICE_ROLE_KEY));
console.log('  database url set:', Boolean(env.STAGING_DATABASE_URL));
console.log('  openai key set:', Boolean(env.OPENAI_API_KEY));
console.log('  production marker in staging targets:', looksLikeProduction(env.STAGING_DATABASE_URL) || looksLikeProduction(env.STAGING_SUPABASE_URL));

console.log('\nManual Railway steps after plan renewal:\n');
console.log('  1. railway environment new staging  # on LoreBook project');
console.log('     OR railway up --new --name lorebook-staging-api  # isolated project');
console.log('  2. Set variables above on the staging service (skip-deploys first)');
console.log('  3. Deploy: railway up -e staging -s <service> -d');
console.log('  4. railway domain  # generate staging public URL');
console.log('  5. Write STAGING_API_URL into .private/staging-credentials.env');
console.log('  6. npm run staging:preflight && npm run staging:smoke');
console.log('');
process.exit(0);
