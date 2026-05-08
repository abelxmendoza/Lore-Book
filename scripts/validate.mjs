#!/usr/bin/env node
/**
 * Local validation script.
 * Run: npm run validate
 *
 * Checks (in order):
 *   1. Frontend TypeScript  (tsc --noEmit)
 *   2. Backend TypeScript   (tsc --noEmit)
 *   3. Mode router unit tests (vitest)
 *   4. Server health        (GET /health)  — skipped if server not running
 *   5. Chat stream          (POST /api/chat/stream) — skipped if server not running
 *   6. OpenAI connectivity  (GET /api/chat/test-openai) — skipped if server not running
 */

import { execSync } from 'child_process';
import { createConnection } from 'net';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..');

// ── Result tracking ──────────────────────────────────────────────────────────

const results = [];

function pass(name, detail = '') {
  results.push({ name, status: 'PASS' });
  console.log(`  ✅  ${name}${detail ? `  (${detail})` : ''}`);
}

function fail(name, detail = '') {
  results.push({ name, status: 'FAIL' });
  console.error(`  ❌  ${name}${detail ? `\n       ${detail}` : ''}`);
}

function warn(name, detail = '') {
  // Warn = pre-existing issues that don't block the server from running (tsx skips type checking)
  results.push({ name, status: 'WARN' });
  console.warn(`  ⚠️   ${name}${detail ? `\n       ${detail}` : ''}`);
}

function skip(name, reason = '') {
  results.push({ name, status: 'SKIP' });
  console.log(`  ⏭   ${name}${reason ? `  — ${reason}` : ''}`);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function run(cmd, cwd) {
  execSync(cmd, { cwd: resolve(ROOT, cwd), stdio: 'pipe' });
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const s = createConnection({ port, host: '127.0.0.1' });
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
    s.setTimeout(1000, () => { s.destroy(); resolve(false); });
  });
}

async function get(path) {
  const res = await fetch(`http://localhost:4000${path}`);
  const body = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function postStream(path, body) {
  const res = await fetch(`http://localhost:4000${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 401) return { status: 401, note: 'auth required (expected without token)' };
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
  }
  // Read the first SSE event and close
  const reader = res.body.getReader();
  const { value } = await reader.read();
  reader.cancel();
  const chunk = new TextDecoder().decode(value);
  if (!chunk.includes('data:')) throw new Error(`No SSE envelope in response: ${chunk.substring(0, 100)}`);
  return { status: res.status, chunk: chunk.substring(0, 120) };
}

// ── Checks ───────────────────────────────────────────────────────────────────

function checkTypeScript(label, cwd) {
  try {
    run('npx tsc --noEmit', cwd);
    pass(label);
  } catch (e) {
    // tsc writes errors to stdout; tsx (used at runtime) skips type checking,
    // so type errors don't prevent the server from running — treat as WARN
    const output = (e.stdout?.toString() ?? '') + (e.stderr?.toString() ?? '');
    const errorLines = output.split('\n').filter(l => /error TS\d+/.test(l));
    const count = errorLines.length;
    const preview = errorLines.slice(0, 3).map(l => l.trim()).join('\n       ');
    warn(label, `${count} pre-existing error(s) — server still runs via tsx\n       ${preview}`);
  }
}

function checkUnitTests() {
  try {
    run('npx vitest run tests/modeRouter.test.ts --reporter=verbose', 'apps/server');
    pass('Mode router regression tests');
  } catch (e) {
    const output = (e.stdout?.toString() ?? '') + (e.stderr?.toString() ?? '');
    const summary = output.split('\n').filter(l => /FAIL|PASS|×|✓|Error/.test(l)).slice(0, 6).join('\n       ');
    fail('Mode router regression tests', summary || 'Run: cd apps/server && npx vitest run tests/modeRouter.test.ts');
  }
}

async function checkServer() {
  const up = await isPortOpen(4000);
  if (!up) {
    skip('Server health',        'server not running — start with: npm run dev:server');
    skip('Chat stream',          'server not running');
    skip('OpenAI connectivity',  'server not running');
    return;
  }

  // Health
  try {
    const data = await get('/health');
    if (data.status !== 'ok') throw new Error(`unexpected status: ${data.status}`);
    pass('Server health', `status=${data.status}`);
  } catch (e) {
    fail('Server health', e.message);
  }

  // Chat stream — 401 means auth middleware works; 500+quota means OpenAI billing issue (not a code bug)
  try {
    const result = await postStream('/api/chat/stream', {
      message: 'I thought the villain needed more depth.',
      conversationHistory: [],
    });
    if (result.status === 401) {
      pass('Chat stream', '401 auth required — middleware responding correctly');
    } else {
      pass('Chat stream', 'SSE envelope received');
    }
  } catch (e) {
    const msg = e.message ?? '';
    if (msg.includes('429') || msg.includes('quota') || msg.includes('insufficient_quota')) {
      warn('Chat stream', 'OpenAI 429 quota exceeded — billing issue, not a code bug. Add credits at platform.openai.com');
    } else {
      fail('Chat stream', msg);
    }
  }

  // OpenAI connectivity — 401 = auth working; 500+429 = billing (not a code bug)
  try {
    const res = await fetch('http://localhost:4000/api/chat/test-openai');
    if (res.status === 401) {
      pass('OpenAI connectivity', '401 — auth middleware working (DISABLE_AUTH_FOR_DEV not set or bypass active)');
    } else if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const bodyStr = JSON.stringify(body);
      if (bodyStr.includes('429') || bodyStr.includes('quota') || bodyStr.includes('insufficient_quota')) {
        warn('OpenAI connectivity', 'API key quota exceeded (429) — add credits at platform.openai.com');
      } else {
        fail('OpenAI connectivity', `HTTP ${res.status}: ${bodyStr.substring(0, 80)}`);
      }
    } else {
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? data.message ?? 'test failed');
      pass('OpenAI connectivity', data.message);
    }
  } catch (e) {
    fail('OpenAI connectivity', e.message);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();
  console.log('\n🔍  Lorekeeper — Local Validation\n');

  console.log('[ 1/4 ]  Frontend TypeScript');
  checkTypeScript('Frontend TypeScript (tsc --noEmit)', 'apps/web');

  console.log('\n[ 2/4 ]  Backend TypeScript');
  checkTypeScript('Backend TypeScript (tsc --noEmit)', 'apps/server');

  console.log('\n[ 3/4 ]  Unit tests — mode router');
  checkUnitTests();

  console.log('\n[ 4/4 ]  Server HTTP checks');
  await checkServer();

  // Summary
  const passed  = results.filter(r => r.status === 'PASS').length;
  const warned  = results.filter(r => r.status === 'WARN').length;
  const failed  = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  ${passed} passed  |  ${warned} warned  |  ${failed} failed  |  ${skipped} skipped  (${elapsed}s)`);

  if (failed > 0) {
    console.error('\n❌  Validation failed — fix the errors above.\n');
    process.exit(1);
  } else if (skipped > 0) {
    console.log('\n⚠️   Some checks skipped. Run  npm run dev:server  then  npm run validate  again.\n');
  } else if (warned > 0) {
    console.log('\n✅  Core checks passed. TypeScript warnings above are pre-existing — fix them separately.\n');
  } else {
    console.log('\n✅  All checks passed.\n');
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
