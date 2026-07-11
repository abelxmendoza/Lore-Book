#!/usr/bin/env node
/**
 * Create or reset an isolated staging Auth test user.
 *
 * Usage: npm run staging:create-test-user
 *
 * Requirements (from staging credential files only):
 *   STAGING_SUPABASE_URL
 *   STAGING_SUPABASE_SERVICE_ROLE_KEY
 *   STAGING_TEST_USER_EMAIL
 *   STAGING_TEST_USER_PASSWORD
 *
 * Never prints passwords or service-role keys.
 */
import {
  loadStagingEnv,
  requireStagingIdentity,
  looksLikeProduction,
} from './lib/staging-env.mjs';

const env = loadStagingEnv();
const identity = requireStagingIdentity(env);

if (!identity.ok) {
  console.error('NO-GO:', identity.issues.join('; '));
  process.exit(2);
}

const url = (env.STAGING_SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = env.STAGING_SUPABASE_SERVICE_ROLE_KEY || '';
const email = env.STAGING_TEST_USER_EMAIL || 'staging-qual+auto@lorebook-staging.test';
const password = env.STAGING_TEST_USER_PASSWORD || '';

if (!url || !serviceKey) {
  console.error('NO-GO: STAGING_SUPABASE_URL and STAGING_SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(2);
}
if (looksLikeProduction(url)) {
  console.error('NO-GO: Supabase URL looks like production');
  process.exit(2);
}
if (!password || password.length < 12) {
  console.error('NO-GO: STAGING_TEST_USER_PASSWORD must be set (≥12 chars) in staging credentials');
  process.exit(2);
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};

async function listByEmail() {
  const q = new URLSearchParams({ page: '1', per_page: '50' });
  const res = await fetch(`${url}/auth/v1/admin/users?${q}`, { headers });
  if (!res.ok) {
    throw new Error(`list users failed: HTTP ${res.status}`);
  }
  const body = await res.json();
  const users = body.users || body || [];
  return users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) || null;
}

async function createUser() {
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        purpose: 'automated_staging_qualification',
        label: 'STAGING_TEST_USER',
        not_production: true,
        created_by: 'staging-create-test-user.mjs',
      },
      app_metadata: {
        role: 'staging_test',
        environment: 'staging',
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`create failed: HTTP ${res.status} ${body?.msg || body?.message || ''}`);
  }
  return body;
}

async function updatePassword(userId) {
  const res = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      password,
      email_confirm: true,
      user_metadata: {
        purpose: 'automated_staging_qualification',
        label: 'STAGING_TEST_USER',
        not_production: true,
      },
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`update failed: HTTP ${res.status} ${body?.msg || ''}`);
  }
  return res.json();
}

async function verifyPasswordGrant() {
  const anon = env.STAGING_SUPABASE_ANON_KEY || serviceKey;
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`password grant failed: HTTP ${res.status} ${body?.error_description || body?.msg || ''}`);
  }
  const body = await res.json();
  return Boolean(body.access_token);
}

async function main() {
  console.log('=== Staging test user ===');
  console.log('Supabase host:', identity.staging.supabaseHost);
  console.log('Email domain:', email.includes('@') ? email.split('@')[1] : '(invalid)');
  console.log('Email local prefix:', email.split('@')[0]?.slice(0, 12) + '…');

  let existing = await listByEmail();
  if (existing) {
    console.log('User exists — resetting password and metadata (id suffix:', existing.id?.slice(-8) + ')');
    await updatePassword(existing.id);
  } else {
    console.log('Creating new staging-only test user…');
    const created = await createUser();
    existing = created.user || created;
    console.log('Created id suffix:', (existing.id || '').slice(-8));
  }

  const ok = await verifyPasswordGrant();
  if (!ok) {
    console.error('NO-GO: could not obtain staging JWT via sign-in grant'); // secret-logging-ok
    process.exit(2);
  }

  console.log('Password grant: OK (JWT acquired, not printed)');
  console.log('User is staging-only metadata-tagged; not present in production by construction.');
  console.log('OK: staging test user ready.');
  process.exit(0);
}

main().catch((e) => {
  console.error('NO-GO:', e.message || e);
  process.exit(2);
});
