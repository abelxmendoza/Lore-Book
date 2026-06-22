#!/usr/bin/env node
/**
 * Supabase pre-upgrade / ops checklist (read-only).
 *
 * Hits /api/health/db and prints storage, upgrade blockers, and SSL hints
 * aligned with Supabase upgrade + backup docs.
 *
 * Usage:
 *   node scripts/supabase-pre-upgrade-check.mjs [base-url]
 *   HEALTH_URL=https://... node scripts/supabase-pre-upgrade-check.mjs
 */

function resolveDbHealthUrl(base) {
  const trimmed = (base || process.env.HEALTH_URL || 'http://localhost:4000').replace(/\/+$/, '');
  const root = trimmed.replace(/\/api\/health(\/db)?$/, '');
  return `${root}/api/health/db`;
}

function fmtBytes(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

async function main() {
  const url = resolveDbHealthUrl(process.argv[2]);
  console.log(`🔎 Supabase ops check: ${url}\n`);

  let payload;
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    payload = await res.json();
  } catch (err) {
    console.error(`❌ Could not fetch DB health: ${err?.message || err}`);
    console.error('   Ensure the API is running and migrations include get_database_storage_stats().');
    process.exit(1);
  }

  const { status, storage, upgrade, connection, missingTables } = payload;
  let exitCode = 0;

  console.log(`Overall status: ${status}`);
  if (Array.isArray(missingTables) && missingTables.length > 0) {
    console.log(`⚠️  Schema degraded — missing tables: ${missingTables.join(', ')}`);
    exitCode = 1;
  }

  console.log('\n## Storage');
  if (storage) {
    const pct =
      storage.utilizationRatio != null
        ? `${Math.round(storage.utilizationRatio * 100)}%`
        : '—';
    console.log(`  Database: ${fmtBytes(storage.databaseBytes)} / ${fmtBytes(storage.quotaBytes)} (${pct})`);
    console.log(`  WAL: ${fmtBytes(storage.walBytes)}`);
    console.log(`  Storage status: ${storage.status}`);
    if (storage.status === 'warn' || storage.status === 'critical') {
      console.log('  → Free space, vacuum, or expand disk before heavy imports.');
      exitCode = 1;
    }
  }

  console.log('\n## Upgrade readiness');
  if (upgrade) {
    console.log(`  Postgres: ${upgrade.postgresVersion ?? 'unknown'}`);
    if (upgrade.cronJobRunDetailsRows != null) {
      console.log(`  pg_cron.job_run_details rows: ${upgrade.cronJobRunDetailsRows.toLocaleString()}`);
    }
    if (Array.isArray(upgrade.enabledExtensions) && upgrade.enabledExtensions.length > 0) {
      console.log(`  Enabled extensions: ${upgrade.enabledExtensions.length}`);
      const sample = upgrade.enabledExtensions
        .slice(0, 8)
        .map((e) => `${e.name}@${e.schema}`)
        .join(', ');
      console.log(`    ${sample}${upgrade.enabledExtensions.length > 8 ? ', …' : ''}`);
    }
    if (upgrade.deprecatedExtensions?.length) {
      console.log(`  Deprecated extensions (PG17 path): ${upgrade.deprecatedExtensions.join(', ')}`);
      console.log('  → Disable under Supabase Dashboard → Database → Extensions before upgrading.');
    }
    console.log(`  Upgrade status: ${upgrade.status}`);
    for (const w of upgrade.warnings ?? []) {
      console.log(`  ⚠️  ${w}`);
    }
    if (upgrade.status === 'warn' || upgrade.status === 'critical') exitCode = 1;
  }

  console.log('\n## Connection / SSL');
  if (connection) {
    console.log(`  DATABASE_URL configured: ${connection.databaseUrlConfigured ? 'yes' : 'no'}`);
    console.log(`  sslmode: ${connection.sslMode ?? '(not set)'}`);
    console.log(`  SSL-enforcement ready: ${connection.sslEnforcementReady ? 'yes' : 'no'}`);
    if (connection.databaseUrlConfigured && !connection.sslEnforcementReady) {
      console.log('  → Add sslmode=require (or verify-full) before enabling Supabase SSL enforcement.');
    }
  }

  console.log('\n## Before upgrading (manual checklist)');
  console.log('  • Take a backup: supabase db dump --db-url $DATABASE_URL (see Supabase backup docs)');
  console.log('  • Prune pg_cron.job_run_details if large');
  console.log('  • Drop read-replicas before upgrade; recreate after');
  console.log('  • Review enabled extensions (Dashboard → Database → Extensions)');
  console.log('  • Disable PG17-deprecated extensions before upgrading to Postgres 17');
  console.log('  • Plan downtime — disk right-sizes to ~1.2× database size after upgrade');

  if (exitCode === 0) {
    console.log('\n✅ No critical ops warnings from /api/health/db');
  } else {
    console.log('\n❌ Ops warnings detected — review before upgrading or importing large datasets');
  }
  process.exit(exitCode);
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
