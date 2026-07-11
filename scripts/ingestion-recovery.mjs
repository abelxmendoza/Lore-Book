#!/usr/bin/env node
/**
 * CLI: scan / repair stranded autobiographical messages.
 *
 * Usage:
 *   node scripts/ingestion-recovery.mjs --dry-run
 *   node scripts/ingestion-recovery.mjs --apply --user <uuid>
 *   node scripts/ingestion-recovery.mjs --retry-message <message-uuid> --user <uuid>
 *
 * Requires LOREKEEPER_API_URL (or API_URL) and a bearer token in
 * LOREKEEPER_RECOVERY_TOKEN (or Authorization via --token).
 *
 * Dry-run by default. Never mutates without --apply.
 */

const base =
  process.env.LOREKEEPER_API_URL ||
  process.env.API_URL ||
  'http://127.0.0.1:4000';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const dryRun = !process.argv.includes('--apply');
const userId = arg('--user');
const messageId = arg('--retry-message') || arg('--message');
const token = arg('--token') || process.env.LOREKEEPER_RECOVERY_TOKEN || process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  if (!token) {
    console.error('Missing --token or LOREKEEPER_RECOVERY_TOKEN');
    process.exit(1);
  }

  if (messageId && userId && process.argv.includes('--retry-message')) {
    const res = await fetch(`${base}/api/chat/messages/${messageId}/retry-ingestion`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ force: true }),
    });
    const body = await res.json().catch(() => ({}));
    console.log(JSON.stringify({ status: res.status, body }, null, 2));
    process.exit(res.ok ? 0 : 1);
  }

  const res = await fetch(`${base}/api/diagnostics/ingestion-recovery`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      dryRun,
      limit: Number(arg('--limit') || 50),
      ...(messageId ? { messageId } : {}),
    }),
  });
  const body = await res.json().catch(() => ({}));
  console.log(JSON.stringify({ status: res.status, dryRun, body }, null, 2));
  process.exit(res.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
