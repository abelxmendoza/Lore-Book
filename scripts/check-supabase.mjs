#!/usr/bin/env node
/**
 * Supabase connectivity check — uses the REST API directly (no SDK needed).
 * Run: npm run check:supabase
 *
 * Checks:
 *   1. Required env vars present
 *   2. Can reach Supabase REST endpoint
 *   3. Can query a safe table (read 1 row)
 *   4. Optionally write+delete in smoke_test_rows if the table exists
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = resolve(__dir, '..');

// ── Load root .env ────────────────────────────────────────────────────────────

function loadEnv() {
  try {
    const raw = readFileSync(resolve(ROOT, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 0) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (k && !process.env[k]) process.env[k] = v;
    }
  } catch { /* rely on process.env */ }
}
loadEnv();

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0, failed = 0;

const pass = (name, detail = '') => { passed++; console.log(`  ✅  ${name}${detail ? `  (${detail})` : ''}`); };
const fail = (name, detail = '') => { failed++; console.error(`  ❌  ${name}${detail ? `\n       ${detail}` : ''}`); };
const warn = (name, detail = '') => console.log(`  ⚠️   ${name}${detail ? `  — ${detail}` : ''}`);

async function supabaseGet(url, svcKey, table, params = 'select=id&limit=1') {
  const res = await fetch(`${url}/rest/v1/${table}?${params}`, {
    headers: {
      'apikey': svcKey,
      'Authorization': `Bearer ${svcKey}`,
      'Content-Type': 'application/json',
    },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function supabasePost(url, svcKey, table, data) {
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': svcKey,
      'Authorization': `Bearer ${svcKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function supabaseDelete(url, svcKey, table, id) {
  const res = await fetch(`${url}/rest/v1/${table}?id=eq.${id}`, {
    method: 'DELETE',
    headers: {
      'apikey': svcKey,
      'Authorization': `Bearer ${svcKey}`,
      'Content-Type': 'application/json',
    },
  });
  return { status: res.status };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🗄️   Supabase Connectivity Check\n');

  const url  = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const svc  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // 1. Env vars
  if (!url || url.includes('placeholder') || url.startsWith('your-') || url === '') {
    fail('SUPABASE_URL', 'missing or placeholder — check root .env');
  } else {
    pass('SUPABASE_URL', url);
  }
  if (!anon || anon === 'test-anon-key') {
    fail('SUPABASE_ANON_KEY', 'missing or test placeholder');
  } else {
    pass('SUPABASE_ANON_KEY', `${anon.substring(0, 24)}…`);
  }
  if (!svc || svc === 'test-service-role-key' || svc === 'service-role-key') {
    fail('SUPABASE_SERVICE_ROLE_KEY', 'missing or placeholder');
  } else {
    pass('SUPABASE_SERVICE_ROLE_KEY', `${svc.substring(0, 24)}…`);
  }

  if (failed > 0) {
    console.error('\n❌  Missing env vars — cannot proceed.\n');
    process.exit(1);
  }

  // 2. Network reach
  try {
    const ping = await fetch(`${url}/rest/v1/`, {
      headers: { 'apikey': svc, 'Authorization': `Bearer ${svc}` },
      signal: AbortSignal.timeout(5000),
    });
    if (ping.status === 200 || ping.status === 404) {
      pass('Supabase REST reachable', `HTTP ${ping.status}`);
    } else {
      warn('Supabase REST reachable', `HTTP ${ping.status} — unexpected but not fatal`);
    }
  } catch (e) {
    if (e.message?.includes('ENOTFOUND') || e.message?.includes('fetch failed')) {
      fail('Supabase REST reachable', `Cannot reach ${url} — check URL or network`);
      console.error('\n❌  Network unreachable. Is this machine online and is the Supabase URL correct?\n');
      process.exit(1);
    }
    fail('Supabase REST reachable', e.message.substring(0, 80));
    process.exit(1);
  }

  // 3. Read from a safe table
  const readCandidates = ['conversation_sessions', 'chat_messages', 'journal_entries', 'profiles'];
  let readPassed = false;
  for (const table of readCandidates) {
    try {
      const { status, body } = await supabaseGet(url, svc, table);
      if (status === 200) {
        pass(`Read ${table}`, `${Array.isArray(body) ? body.length : 0} row(s) returned`);
        readPassed = true;
        break;
      } else if (status === 404 || (body?.code === '42P01')) {
        warn(`Read ${table}`, 'table not found — trying next');
      } else if (status === 401 || status === 403) {
        fail(`Read ${table}`, `HTTP ${status} — check service role key permissions`);
        break;
      } else {
        warn(`Read ${table}`, `HTTP ${status}: ${JSON.stringify(body).substring(0, 60)}`);
      }
    } catch (e) {
      warn(`Read ${table}`, e.message.substring(0, 60));
    }
  }
  if (!readPassed && failed === 0) {
    warn('Read check', 'None of the candidate tables returned data — RLS or table names may differ');
  }

  // 4. Write + delete in smoke_test_rows (only if table exists)
  try {
    const { status: chkStatus } = await supabaseGet(url, svc, 'smoke_test_rows');
    if (chkStatus === 200) {
      const label = `smoke-${Date.now()}`;
      const { status: insStatus, body: insBody } = await supabasePost(url, svc, 'smoke_test_rows', { label });
      if (insStatus === 201) {
        const id = Array.isArray(insBody) ? insBody[0]?.id : insBody?.id;
        if (id) {
          await supabaseDelete(url, svc, 'smoke_test_rows', id);
          pass('Write + delete (smoke_test_rows)', `inserted id=${id} then deleted`);
        } else {
          warn('Write + delete', 'insert succeeded but no id returned');
        }
      } else {
        warn('Write + delete', `insert returned HTTP ${insStatus}`);
      }
    } else {
      warn('Write/delete test', 'smoke_test_rows not found — skipped (CREATE TABLE smoke_test_rows (id uuid default gen_random_uuid() primary key, label text) to enable)');
    }
  } catch (e) {
    warn('Write/delete test', e.message.substring(0, 80));
  }

  // Summary
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  ${passed} passed  |  ${failed} failed`);
  if (failed > 0) {
    console.error('\n❌  Supabase check failed.\n');
    process.exit(1);
  } else {
    console.log('\n✅  Supabase connectivity verified.\n');
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
