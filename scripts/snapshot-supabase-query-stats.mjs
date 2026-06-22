#!/usr/bin/env node
/**
 * Daily Supabase query-stats snapshot — tracks pg_stat_statements rates and
 * org-family call volume after the egress hardening deploy.
 *
 * Saves JSON under .private/supabase-query-snapshots/ (gitignored).
 * Compares against the previous snapshot when one exists.
 *
 * Usage:
 *   npm run snapshot:query-stats
 *   node scripts/snapshot-supabase-query-stats.mjs
 *   node scripts/snapshot-supabase-query-stats.mjs --no-save    # print only
 *   node scripts/snapshot-supabase-query-stats.mjs --json       # stdout JSON
 *
 * Requires DATABASE_URL or SUPABASE_CONNECTION_STRING in .env (session/direct URI).
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..');
const OUT_DIR = resolve(ROOT, '.private/supabase-query-snapshots');

const args = new Set(process.argv.slice(2));
const NO_SAVE = args.has('--no-save');
const JSON_OUT = args.has('--json');

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
  } catch {
    /* rely on process.env */
  }
}

loadEnv();

const RAW_URL = process.env.DATABASE_URL || process.env.SUPABASE_CONNECTION_STRING;
if (!RAW_URL) {
  console.error('✗ DATABASE_URL (or SUPABASE_CONNECTION_STRING) required in .env');
  process.exit(1);
}

const CONN = RAW_URL.replace(/\?.*$/, '');

const ORG_FAMILY_FILTER = `
  query ILIKE '%organizations%'
  OR query ILIKE '%organization_%'
  OR query ILIKE '%group_candidates%'
`;

const CHAT_FILTER = `query ILIKE '%chat_messages%'`;

async function main() {
  const sql = postgres(CONN, { max: 1, prepare: false, connect_timeout: 15 });

  try {
    const [infoRows, totalsRows, orgRows, chatRows, topRows, tableRows, rpcRows] =
      await Promise.all([
        sql`
          SELECT stats_reset::text AS stats_reset
          FROM extensions.pg_stat_statements_info
        `,
        sql`
          SELECT
            round(extract(epoch FROM (now() - i.stats_reset)) / 3600.0, 2) AS hours_since_reset,
            coalesce(sum(s.calls), 0)::bigint AS total_calls,
            coalesce(sum(s.rows), 0)::bigint AS total_rows,
            count(s.*)::int AS distinct_patterns,
            round(
              coalesce(sum(s.calls), 0)::numeric
              / nullif(extract(epoch FROM (now() - i.stats_reset)) / 3600.0, 0),
              1
            ) AS calls_per_hour
          FROM extensions.pg_stat_statements_info i
          CROSS JOIN extensions.pg_stat_statements s
          GROUP BY i.stats_reset
        `,
        sql.unsafe(`
          SELECT coalesce(sum(calls), 0)::bigint AS org_family_calls
          FROM extensions.pg_stat_statements
          WHERE ${ORG_FAMILY_FILTER}
        `),
        sql.unsafe(`
          SELECT coalesce(sum(calls), 0)::bigint AS chat_message_calls
          FROM extensions.pg_stat_statements
          WHERE ${CHAT_FILTER}
        `),
        sql`
          SELECT
            left(regexp_replace(query, '\\s+', ' ', 'g'), 140) AS query_snippet,
            calls::bigint AS calls,
            rows::bigint AS rows,
            round(total_exec_time::numeric, 1) AS total_ms,
            round(mean_exec_time::numeric, 2) AS mean_ms
          FROM extensions.pg_stat_statements
          ORDER BY calls DESC
          LIMIT 10
        `,
        sql`
          SELECT relname AS table_name, n_live_tup::bigint AS est_rows
          FROM pg_stat_user_tables
          WHERE schemaname = 'public'
            AND relname = ANY(ARRAY[
              'organizations', 'organization_memberships', 'organization_relationships',
              'group_candidates', 'chat_messages', 'journal_entries',
              'omega_entities', 'conversation_sessions'
            ])
          ORDER BY n_live_tup DESC
        `,
        sql`
          SELECT pg_get_function_result(p.oid) AS returns
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'match_journal_entries'
          LIMIT 1
        `,
      ]);

    const statsReset = infoRows[0]?.stats_reset ?? null;
    const totals = totalsRows[0] ?? {};
    const orgFamilyCalls = Number(orgRows[0]?.org_family_calls ?? 0);
    const chatMessageCalls = Number(chatRows[0]?.chat_message_calls ?? 0);
    const rpcReturns = rpcRows[0]?.returns ?? '';
    const embeddingInRpc = /\bembedding\b/i.test(rpcReturns);

    const snapshot = {
      sampled_at: new Date().toISOString(),
      stats_reset: statsReset,
      window: {
        hours_since_reset: Number(totals.hours_since_reset ?? 0),
        total_calls: Number(totals.total_calls ?? 0),
        total_rows: Number(totals.total_rows ?? 0),
        distinct_patterns: Number(totals.distinct_patterns ?? 0),
        calls_per_hour: Number(totals.calls_per_hour ?? 0),
      },
      egress_watch: {
        org_family_calls: orgFamilyCalls,
        org_family_pct:
          totals.total_calls > 0
            ? roundPct(orgFamilyCalls / Number(totals.total_calls))
            : 0,
        chat_message_calls: chatMessageCalls,
        chat_message_pct:
          totals.total_calls > 0
            ? roundPct(chatMessageCalls / Number(totals.total_calls))
            : 0,
        match_journal_entries_returns_embedding: embeddingInRpc,
      },
      top_queries_by_calls: topRows.map((r) => ({
        query_snippet: r.query_snippet,
        calls: Number(r.calls),
        rows: Number(r.rows),
        total_ms: Number(r.total_ms),
        mean_ms: Number(r.mean_ms),
      })),
      table_row_estimates: Object.fromEntries(
        tableRows.map((r) => [r.table_name, Number(r.est_rows)])
      ),
      baseline_reference: {
        note: 'Pre-fix audit (~Jun 2026): ~27.7M calls / ~28d, org-family ~82%, ~25k–41k calls/hr',
        org_family_calls_historical: 11_100_000,
        total_calls_historical: 27_700_000,
      },
    };

    const previous = loadPreviousSnapshot();
    const delta = previous ? computeDelta(previous, snapshot) : null;

    if (!NO_SAVE) {
      mkdirSync(OUT_DIR, { recursive: true });
      const day = snapshot.sampled_at.slice(0, 10);
      const dayPath = resolve(OUT_DIR, `${day}.json`);
      writeFileSync(dayPath, JSON.stringify({ ...snapshot, delta_vs_previous: delta }, null, 2));
      writeFileSync(resolve(OUT_DIR, 'latest.json'), JSON.stringify({ ...snapshot, delta_vs_previous: delta }, null, 2));
    }

    if (JSON_OUT) {
      console.log(JSON.stringify({ ...snapshot, delta_vs_previous: delta }, null, 2));
      return;
    }

    printReport(snapshot, delta, previous);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function roundPct(ratio) {
  return Math.round(ratio * 1000) / 10;
}

function loadPreviousSnapshot() {
  const latestPath = resolve(OUT_DIR, 'latest.json');
  if (!existsSync(latestPath)) return null;
  try {
    return JSON.parse(readFileSync(latestPath, 'utf8'));
  } catch {
    return null;
  }
}

function computeDelta(prev, curr) {
  const d = (a, b) => (b ?? 0) - (a ?? 0);
  return {
    previous_sampled_at: prev.sampled_at,
    hours_since_previous: hoursBetween(prev.sampled_at, curr.sampled_at),
    calls_per_hour_change: d(prev.window?.calls_per_hour, curr.window?.calls_per_hour),
    org_family_calls_change: d(prev.egress_watch?.org_family_calls, curr.egress_watch?.org_family_calls),
    org_family_pct_change: d(prev.egress_watch?.org_family_pct, curr.egress_watch?.org_family_pct),
    chat_message_calls_change: d(prev.egress_watch?.chat_message_calls, curr.egress_watch?.chat_message_calls),
  };
}

function hoursBetween(a, b) {
  return Math.round(((new Date(b).getTime() - new Date(a).getTime()) / 3_600_000) * 100) / 100;
}

function fmtDelta(n, suffix = '') {
  if (n == null || Number.isNaN(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n}${suffix}`;
}

function printReport(snapshot, delta, previous) {
  const w = snapshot.window;
  const e = snapshot.egress_watch;

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Supabase query stats snapshot');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Sampled:      ${snapshot.sampled_at}`);
  console.log(`  Stats reset:  ${snapshot.stats_reset ?? 'unknown'}`);
  console.log(`  Window:       ${w.hours_since_reset}h since reset`);
  console.log('');
  console.log('  Throughput');
  console.log(`    Total calls:     ${w.total_calls.toLocaleString()}`);
  console.log(`    Calls / hour:    ${w.calls_per_hour.toLocaleString()}`);
  console.log(`    Distinct patterns: ${w.distinct_patterns}`);
  console.log('');
  console.log('  Egress watch (org cache target)');
  console.log(`    Org-family calls:  ${e.org_family_calls.toLocaleString()} (${e.org_family_pct}% of window)`);
  console.log(`    Chat message calls: ${e.chat_message_calls.toLocaleString()} (${e.chat_message_pct}%)`);
  console.log(
    `    RPC returns embedding: ${e.match_journal_entries_returns_embedding ? 'YES ⚠' : 'no ✓'}`
  );
  console.log('');

  if (delta && previous) {
    console.log('  vs previous snapshot');
    console.log(`    Previous:        ${delta.previous_sampled_at} (${delta.hours_since_previous}h ago)`);
    console.log(`    Calls/hr:        ${fmtDelta(delta.calls_per_hour_change)}`);
    console.log(`    Org-family:      ${fmtDelta(delta.org_family_calls_change)} calls`);
    console.log(`    Org-family %:    ${fmtDelta(delta.org_family_pct_change, ' pp')}`);
    console.log(`    Chat messages:   ${fmtDelta(delta.chat_message_calls_change)} calls`);
    console.log('');
  }

  console.log('  Top queries (by calls)');
  for (const q of snapshot.top_queries_by_calls.slice(0, 5)) {
    console.log(`    ${String(q.calls).padStart(6)}  ${q.query_snippet.slice(0, 90)}`);
  }
  console.log('');

  if (!NO_SAVE) {
    const files = readdirSync(OUT_DIR).filter((f) => f.endsWith('.json')).length;
    console.log(`  Saved → .private/supabase-query-snapshots/latest.json (${files} files total)`);
  }
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
}

main().catch((err) => {
  console.error('✗ snapshot failed:', err?.message ?? err);
  process.exit(1);
});
