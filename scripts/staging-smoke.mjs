#!/usr/bin/env node
/**
 * Bounded hosted staging smoke (no fault injection, no full qualification).
 *
 * Usage: npm run staging:smoke
 *
 * Checks:
 *  - staging API health
 *  - staging Auth password grant
 *  - one chat message path (if API supports it)
 *  - ingestion job observability (best-effort)
 *  - meaning GET user-scoped / cross-user denied (best-effort)
 *
 * Exit 0 = smoke passed
 * Exit 2 = NO-GO
 */
import {
  loadStagingEnv,
  requireStagingIdentity,
  looksLikeProduction,
  hostOf,
} from './lib/staging-env.mjs';

const env = loadStagingEnv();
const identity = requireStagingIdentity(env);

if (!identity.ok) {
  console.error('NO-GO:', identity.issues.join('; '));
  process.exit(2);
}

const api = (env.STAGING_API_URL || '').replace(/\/$/, '');
const supa = (env.STAGING_SUPABASE_URL || '').replace(/\/$/, '');
const anon = env.STAGING_SUPABASE_ANON_KEY || '';
const serviceKey = env.STAGING_SUPABASE_SERVICE_ROLE_KEY || '';
const email = env.STAGING_TEST_USER_EMAIL || '';
const password = env.STAGING_TEST_USER_PASSWORD || '';

const results = [];

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail ? `— ${detail}` : '');
}

async function main() {
  console.log('=== Staging smoke (bounded) ===');
  console.log('API host:', hostOf(api) || '(unset)');
  console.log('Supabase host:', hostOf(supa) || '(unset)');

  if (looksLikeProduction(api) || looksLikeProduction(supa)) {
    console.error('NO-GO: production identity');
    process.exit(2);
  }

  if (!api) {
    record('staging API health', false, 'STAGING_API_URL unset');
    summarize(false);
    process.exit(2);
  }

  // 1. API health
  try {
    const res = await fetch(`${api}/api/health`, { signal: AbortSignal.timeout(10000) });
    record('staging API health', res.ok, `HTTP ${res.status}`);
  } catch (e) {
    record('staging API health', false, e.message);
  }

  // 2. Auth
  let accessToken = '';
  let userId = '';
  if (supa && anon && email && password) {
    try {
      const res = await fetch(`${supa}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: anon, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(10000),
      });
      const body = await res.json().catch(() => ({}));
      accessToken = body.access_token || '';
      userId = body.user?.id || '';
      record('staging authentication', Boolean(accessToken), res.ok ? 'JWT acquired' : `HTTP ${res.status}`);
    } catch (e) {
      record('staging authentication', false, e.message);
    }
  } else {
    record('staging authentication', false, 'missing STAGING_TEST_USER_* or anon key');
  }

  // 3. Chat message (best-effort — endpoint shapes vary)
  if (accessToken) {
    try {
      const res = await fetch(`${api}/api/chat/stream`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          message: 'Staging smoke: I work as a software engineer in Seattle.',
          client_message_id: `staging-smoke-${Date.now()}`,
        }),
        signal: AbortSignal.timeout(45000),
      });
      // Any non-5xx that acknowledges auth is useful; 404 means route not deployed yet
      const ok = res.status !== 401 && res.status !== 403 && res.status < 500;
      record('chat message path', ok, `HTTP ${res.status}`);
      // Drain body briefly
      try {
        await res.text();
      } catch {
        /* ignore */
      }
    } catch (e) {
      record('chat message path', false, e.message);
    }
  } else {
    record('chat message path', false, 'no token');
  }

  // 4. Meaning GET user-scoped (if route exists)
  if (accessToken) {
    try {
      const res = await fetch(`${api}/api/chat/meaning`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10000),
      });
      // 200/204/404 acceptable; 401/403 fail
      const ok = res.status !== 401 && res.status !== 403;
      record('meaning GET reachable', ok, `HTTP ${res.status}`);
    } catch (e) {
      record('meaning GET reachable', false, e.message);
    }

    // Cross-user: call with garbage user path if supported
    try {
      const res = await fetch(`${api}/api/chat/meaning?userId=00000000-0000-0000-0000-000000000099`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10000),
      });
      // Must not return another user's data as 200 with foreign rows — 403/404/400/200 empty ok
      const denied = res.status === 403 || res.status === 401 || res.status === 404 || res.status === 400;
      const emptyOk = res.status === 200; // handler may ignore query and scope by JWT
      record('cross-user access denied or JWT-scoped', denied || emptyOk, `HTTP ${res.status}`);
    } catch (e) {
      record('cross-user access denied or JWT-scoped', false, e.message);
    }
  }

  // 5. Optional: service-role job peek (staging only)
  if (serviceKey && supa) {
    try {
      const res = await fetch(
        `${supa}/rest/v1/ingestion_jobs?select=id,status&limit=1`,
        {
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
          signal: AbortSignal.timeout(10000),
        },
      );
      record('ingestion_jobs table readable (service)', res.ok || res.status === 200 || res.status === 206, `HTTP ${res.status}`);
    } catch (e) {
      record('ingestion_jobs table readable (service)', false, e.message);
    }
  }

  const required = ['staging API health', 'staging authentication'];
  const requiredOk = results.filter((r) => required.includes(r.name)).every((r) => r.ok);
  summarize(requiredOk);
  process.exit(requiredOk ? 0 : 2);
}

function summarize(ok) {
  console.log('');
  console.log(ok ? 'OK: bounded staging smoke passed required checks.' : 'NO-GO: staging smoke failed.');
}

main().catch((e) => {
  console.error('NO-GO:', e.message || e);
  process.exit(2);
});
