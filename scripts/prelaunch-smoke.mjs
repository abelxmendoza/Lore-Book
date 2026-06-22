#!/usr/bin/env node
/**
 * Pre-launch smoke checks for lorebookai.com public launch.
 *
 * Usage:
 *   npm run prelaunch:smoke
 *   npm run prelaunch:smoke -- --base https://lorebookai.com
 */

const DEFAULT_BASE = 'https://lorebookai.com';

function parseArgs(argv) {
  const args = { base: DEFAULT_BASE };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') args.base = argv[++i];
  }
  return args;
}

const pass = (name, detail = '') => {
  console.log(`  ✅  ${name}${detail ? ` — ${detail}` : ''}`);
  return 1;
};

const fail = (name, detail = '') => {
  console.error(`  ❌  ${name}${detail ? `\n       ${detail}` : ''}`);
  return 1;
};

const warn = (name, detail = '') => {
  console.log(`  ⚠️   ${name}${detail ? ` — ${detail}` : ''}`);
};

async function fetchCheck(url, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(12_000) });
  const text = await res.text().catch(() => '');
  return { res, text };
}

async function main() {
  const { base } = parseArgs(process.argv.slice(2));
  const origin = base.replace(/\/+$/, '');
  let ok = 0;
  let bad = 0;

  console.log(`\n🚀 Pre-launch smoke — ${origin}\n`);

  // 1. Liveness
  try {
    const { res, text } = await fetchCheck(`${origin}/api/health`);
      if (res.status === 200 && text.includes('"status":"ok"')) {
        ok += pass('API health', 'HTTP 200');
        if (text.includes('"STRIPE_SECRET_KEY":true')) ok += pass('Stripe env on server');
        else bad += fail('Stripe env on server', 'STRIPE_SECRET_KEY missing in health payload');
      } else {
        bad += fail('API health', `HTTP ${res.status}`);
      }
  } catch (e) {
    bad += fail('API health', e.message);
  }

  // 2. DB schema
  try {
    const { res, text } = await fetchCheck(`${origin}/api/health/db`);
    if (res.status === 200 && !text.includes('"status":"degraded"')) {
      ok += pass('DB schema', 'not degraded');
    } else {
      bad += fail('DB schema', text.slice(0, 200));
    }
  } catch (e) {
    bad += fail('DB schema', e.message);
  }

  // 3. CORS from browser origin
  try {
    const { res } = await fetchCheck(`${origin}/api/health`, { headers: { Origin: origin } });
    const acao = res.headers.get('access-control-allow-origin');
    if (acao === origin || acao === '*') ok += pass('CORS', acao ?? 'allowed');
    else bad += fail('CORS', `Expected ${origin}, got ${acao ?? 'none'}`);
  } catch (e) {
    bad += fail('CORS', e.message);
  }

  // 4. Legal (required for Google OAuth + in-app terms)
  for (const [path, label] of [
    ['/api/legal/terms', 'Terms of Service'],
    ['/api/legal/privacy', 'Privacy Policy'],
  ]) {
    try {
      const { res, text } = await fetchCheck(`${origin}${path}`);
      if (res.status === 200 && text.length > 100 && !text.includes('"error"')) {
        ok += pass(label, `${text.length} bytes`);
      } else {
        bad += fail(label, `HTTP ${res.status} — ${text.slice(0, 120)}`);
      }
    } catch (e) {
      bad += fail(label, e.message);
    }
  }

  // 5. Public pages
  for (const path of ['/', '/login', '/pricing', '/terms', '/privacy-policy']) {
    try {
      const { res } = await fetchCheck(`${origin}${path}`);
      if (res.status === 200) ok += pass(`Page ${path}`);
      else bad += fail(`Page ${path}`, `HTTP ${res.status}`);
    } catch (e) {
      bad += fail(`Page ${path}`, e.message);
    }
  }

  // 6. Supabase primary + fallback reachability
  const supabasePrimary = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://supabase.lorebookai.com';
  const supabaseFallback = process.env.SUPABASE_URL_FALLBACK || 'https://cshtthzpgkmrbcsfghyq.supabase.co';

  for (const [url, label] of [
    [supabasePrimary, 'Supabase primary'],
    [supabaseFallback, 'Supabase fallback'],
  ]) {
    try {
      const { res } = await fetchCheck(`${url.replace(/\/$/, '')}/auth/v1/health`);
      if (res.status === 200 || res.status === 401) ok += pass(label, url);
      else warn(label, `HTTP ${res.status} — ${url}`);
    } catch (e) {
      warn(label, `${url} — ${e.message}`);
    }
  }

  // 7. Auth API expects credentials (sanity)
  try {
    const { res, text } = await fetchCheck(`${origin}/api/subscription/status`);
    if (res.status === 401 && text.includes('Authorization')) {
      ok += pass('Auth middleware', 'protected routes require JWT');
    } else {
      warn('Auth middleware', `Expected 401, got HTTP ${res.status}`);
    }
  } catch (e) {
    warn('Auth middleware', e.message);
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  ${ok} passed  |  ${bad} failed\n`);

  if (bad > 0) {
    console.error('❌ Pre-launch smoke FAILED — fix blockers before public launch.\n');
    process.exit(1);
  }

  console.log('✅ Automated checks passed.');
  console.log('\nManual launch checklist (you):');
  console.log('  1. Stripe: switch Vercel + Railway to sk_live_ / pk_live_ + live webhook');
  console.log('  2. Google Cloud: OAuth consent → In production + privacy/terms URLs');
  console.log('  3. Supabase: enable Custom Domain add-on OR rely on auto-fallback (deployed)');
  console.log('  4. Deploy latest commit to Railway + Vercel (bootstrap.js + legal fix)');
  console.log('  5. Sign in on production: Google OAuth + magic link end-to-end');
  console.log('  6. Stripe checkout: subscribe once with a real card, verify webhook\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
