/**
 * Simulate monthly Supabase egress BEFORE vs AFTER the column-projection sprint.
 *
 * Pure / offline — needs NO database connection, so it runs even while the project
 * is egress-restricted. It combines:
 *   (a) measured per-row JSON payload sizes (full select('*') vs projected), and
 *   (b) a transparent model of how many rows each hot path fetches.
 * Tune the ASSUMPTIONS block for your own traffic and re-run.
 *
 * Row sizes are from a live measurement on 2026-06-21 (octet_length(to_jsonb(row))
 * with and without the `embedding` key). A 1536-dim vector is ~19 KB as JSON.
 *
 * Usage: npx tsx scripts/simulate-egress.ts
 * Or:    npm run egress:simulate
 *        npm run egress:simulate -- --msgs 50 --users 3 --hours 6
 */

// ---- Measured per-row JSON bytes (full vs projected; see header) -------------
const ROW = {
  entity: { full: 19242, proj: 367 },
  claim: { full: 19998, proj: 769 },
  memoryComponent: { full: 16980, proj: 713 },
  journal: { full: 17116, proj: 1425 },
};

// ---- ASSUMPTIONS (edit these) -----------------------------------------------
function parseArg(name: string, def: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return Number(process.argv[i + 1]);
  return def;
}
const A = {
  users: parseArg('users', 3),
  msgsPerUserPerDay: parseArg('msgs', 15),
  activeHoursPerDay: parseArg('hours', 6), // hours an app tab sits open (poller window)
  pollIntervalSec: parseArg('poll', 20), // suggestion poller cadence
  daysPerMonth: 30,

  // Per-message hot-path fetch model (rows pulled per chat message), grounded in
  // omegaMemoryService + the RAG packet. Current DB has 102 entities / 5 types.
  entityBatchRows: 102, // batch load scans the user's entities (limit 500, returns all)
  entityFuzzyRows: 102, // fuzzy scan (limit 150, returns all)
  ragEntityRows: 20, // top-K entities hydrated into the RAG packet
  ragJournalRows: 10, // journal entries pulled for recall
  ragMemoryRows: 15, // memory_components pulled
  claimsPerMessage: 7, // claims read for conflict detect / context (kept w/ embedding both sides)

  // Poller model: each poll fetched suggestion rows carrying embeddings (OLD);
  // visibility-gating + projection makes these tiny/none (NEW).
  pollerRowsPerTick: 20,
};

const MB = 1024 * 1024;
const GB = 1024 * MB;

function perMessageBytes(kind: 'full' | 'proj'): number {
  const r = (t: keyof typeof ROW) => ROW[t][kind];
  return (
    A.entityBatchRows * r('entity') +
    A.entityFuzzyRows * r('entity') +
    A.ragEntityRows * r('entity') +
    A.ragJournalRows * r('journal') +
    A.ragMemoryRows * r('memoryComponent') +
    // claims keep the embedding in BOTH worlds (findSimilarClaims trade-off), so
    // count the full size on both sides — it is not part of the savings.
    A.claimsPerMessage * ROW.claim.full
  );
}

function pollerMonthlyBytes(kind: 'full' | 'proj'): number {
  const ticksPerDay = (A.activeHoursPerDay * 3600) / A.pollIntervalSec;
  const rowBytes = kind === 'full' ? ROW.entity.full : ROW.entity.proj;
  // NEW world: pollers are visibility-gated AND projected. Model the gating as the
  // poller effectively not running while hidden — keep a small residual.
  const effectiveRows = kind === 'full' ? A.pollerRowsPerTick : A.pollerRowsPerTick * 0.1;
  return ticksPerDay * effectiveRows * rowBytes * A.users * A.daysPerMonth;
}

function monthlyMessages(): number {
  return A.users * A.msgsPerUserPerDay * A.daysPerMonth;
}

function report() {
  const msgs = monthlyMessages();
  const msgFull = perMessageBytes('full') * msgs;
  const msgProj = perMessageBytes('proj') * msgs;
  const pollFull = pollerMonthlyBytes('full');
  const pollProj = pollerMonthlyBytes('proj');
  const totalFull = msgFull + pollFull;
  const totalProj = msgProj + pollProj;

  const fmt = (b: number) => (b >= GB ? `${(b / GB).toFixed(2)} GB` : `${(b / MB).toFixed(1)} MB`);
  const tier = (b: number) =>
    b <= 5 * GB ? 'Free (≤5GB)' : b <= 250 * GB ? 'Pro (≤250GB)' : 'over Pro — +$0.09/GB';

  console.log('\nEgress simulation (monthly)  —  assumptions:');
  console.log(
    `  users=${A.users}  msgs/user/day=${A.msgsPerUserPerDay}  active hrs/day=${A.activeHoursPerDay}  poll=${A.pollIntervalSec}s\n`
  );
  console.log(`  monthly chat messages: ${msgs.toLocaleString()}`);
  console.log('  ' + '-'.repeat(58));
  console.log(`  ${'component'.padEnd(22)}${'BEFORE'.padStart(16)}${'AFTER'.padStart(16)}`);
  console.log(`  ${'per-message reads'.padEnd(22)}${fmt(msgFull).padStart(16)}${fmt(msgProj).padStart(16)}`);
  console.log(`  ${'background pollers'.padEnd(22)}${fmt(pollFull).padStart(16)}${fmt(pollProj).padStart(16)}`);
  console.log('  ' + '-'.repeat(58));
  console.log(`  ${'TOTAL / month'.padEnd(22)}${fmt(totalFull).padStart(16)}${fmt(totalProj).padStart(16)}`);
  console.log(`  ${'plan tier'.padEnd(22)}${tier(totalFull).padStart(16)}${tier(totalProj).padStart(16)}`);
  console.log(`\n  reduction: ${(100 * (1 - totalProj / totalFull)).toFixed(1)}%  (${fmt(totalFull - totalProj)} saved/month)\n`);
  console.log('  Tune: npm run egress:simulate -- --msgs 30 --users 10 --hours 8 --poll 15\n');
}

report();
