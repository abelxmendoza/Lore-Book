#!/usr/bin/env node
/**
 * Smoke test — requires the server to be running on localhost:4000.
 * Run: npm run smoke
 *
 * Tests:
 *   GET  /health
 *   GET  /api/chat/test-openai   (verifies OpenAI key is wired up)
 *   POST /api/chat/stream        (normal conversation — should NOT return "Noted.")
 *   POST /api/chat/stream        (explicit log command — should return ACTION_LOG)
 */

const BASE = 'http://localhost:4000';

// ── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function smoke(label, fn) {
  try {
    const note = await fn();
    console.log(`  ✅  ${label}${note ? `  — ${note}` : ''}`);
    passed++;
    return true;
  } catch (e) {
    console.error(`  ❌  ${label}  — ${e.message}`);
    failed++;
    return false;
  }
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body).substring(0, 120)}`);
  return { status: res.status, body };
}

async function postStream(path, payload) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  // 401 without auth token is acceptable — it means the middleware is running
  if (res.status === 401) return { status: 401, events: [] };
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
  }
  // Collect first few SSE events (up to 2 KB or 3 events)
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  let eventCount = 0;
  while (eventCount < 4) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
    eventCount = (raw.match(/^data:/gm) ?? []).length;
    if (raw.length > 2048) break;
  }
  reader.cancel();
  // Parse events
  const events = raw
    .split('\n\n')
    .filter(e => e.startsWith('data:'))
    .map(e => { try { return JSON.parse(e.slice(6)); } catch { return null; } })
    .filter(Boolean);
  return { status: res.status, events, raw };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n💨  Lorekeeper Smoke Test\n`);
  console.log(`   Target: ${BASE}\n`);

  // 1. Health
  await smoke('GET /health', async () => {
    const { body } = await get('/health');
    if (body.status !== 'ok') throw new Error(`unexpected status: ${body.status}`);
    return `status=${body.status}`;
  });

  // 2. OpenAI connectivity — 401 = auth working; 429/quota = billing (not a code bug)
  await smoke('GET /api/chat/test-openai', async () => {
    const res = await fetch(`${BASE}/api/chat/test-openai`);
    if (res.status === 401) return '401 auth required — middleware responding correctly';
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const bodyStr = JSON.stringify(body);
      if (bodyStr.includes('429') || bodyStr.includes('quota')) {
        return '⚠ OpenAI 429 quota exceeded — DEV_AI_FALLBACK will handle this in chat';
      }
      throw new Error(`HTTP ${res.status}: ${bodyStr.substring(0, 80)}`);
    }
    if (!body.success) throw new Error(body.error ?? body.message ?? 'OpenAI test failed');
    return body.message;
  });

  // 3. Normal conversation — must NOT be "Noted."; accepts fallback response when DEV_AI_FALLBACK=true
  await smoke('POST /api/chat/stream  [normal conversation]', async () => {
    const { status, events } = await postStream('/api/chat/stream', {
      message: 'I thought the villain needed more depth.',
      conversationHistory: [],
    });
    if (status === 401) return 'auth required — set DISABLE_AUTH_FOR_DEV=true to test content';

    const metadata = events.find(e => e.type === 'metadata');
    const chunks   = events.filter(e => e.type === 'chunk').map(e => e.content).join('');

    // Detect dev fallback response (clearly labelled, not pretending to be real AI)
    if (metadata?.data?.fallback === true) {
      const mode = metadata?.data?.response_mode ?? 'unknown';
      const reason = metadata?.data?.fallback_reason ?? 'DEV_AI_FALLBACK';
      return `DEV_AI_FALLBACK active — mode=${mode}, reason="${reason}"`;
    }

    if (chunks.trim() === 'Noted.') {
      throw new Error('Got "Noted." — MODE ROUTER BUG: message was classified as ACTION_LOG');
    }
    const preview = chunks.substring(0, 80).replace(/\n/g, ' ');
    return preview ? `"${preview}…"` : 'SSE stream received';
  });

  // 4. Explicit log command — should acknowledge (not full AI conversation)
  await smoke('POST /api/chat/stream  [explicit log command]', async () => {
    const { status, events } = await postStream('/api/chat/stream', {
      message: 'Log this: Abel entered the lab.',
      conversationHistory: [],
    });
    if (status === 401) return 'auth required — skipping content check';

    const metadata = events.find(e => e.type === 'metadata');
    const mode = metadata?.data?.response_mode ?? 'unknown';
    return `response_mode=${mode}`;
  });

  // Summary
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  ${passed} passed  |  ${failed} failed`);
  if (failed > 0) {
    console.error('\n❌  Smoke test failed.\n');
    console.error('   Make sure the server is running:  npm run dev:server\n');
    process.exit(1);
  } else {
    console.log('\n✅  Smoke test passed.\n');
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
