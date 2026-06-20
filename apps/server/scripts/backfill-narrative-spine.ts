/**
 * Backfill narrative_claims + edges from existing lore artifacts.
 *
 * Calls only existing bridge functions — no new detection logic.
 *
 * Usage:
 *   npx tsx apps/server/scripts/backfill-narrative-spine.ts
 *   npx tsx apps/server/scripts/backfill-narrative-spine.ts --userId=<uuid>
 *   npx tsx apps/server/scripts/backfill-narrative-spine.ts --limit=500
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '../..');
dotenv.config({ path: resolve(rootDir, '.env') });
dotenv.config({ path: resolve(rootDir, '.env.development') });

import { supabaseAdmin } from '../src/services/supabaseClient';
import {
  bridgeCrystallizedKnowledge,
  bridgeEntryIr,
  bridgeEventInterpretation,
  bridgeResolvedEvent,
} from '../src/services/narrativeSpine/legacyClaimBridge';

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

async function backfillTable(
  label: string,
  rows: Array<{ user_id: string; id: string; title?: string }>,
  bridge: (userId: string, id: string) => Promise<unknown>,
): Promise<number> {
  let ok = 0;
  for (const row of rows) {
    const result = await bridge(row.user_id, row.id);
    if (result) ok += 1;
    const hint = row.title ? `"${row.title.slice(0, 48)}"` : row.id.slice(0, 8);
    console.log(`  [${label}] ${hint} -> ${result ? 'bridged' : 'skipped'}`);
  }
  return ok;
}

async function main() {
  const userIdFilter = parseArg('userId');
  const limit = Number.parseInt(parseArg('limit') ?? '1000', 10);

  console.log('Backfilling narrative spine…');
  if (userIdFilter) console.log(`  user filter: ${userIdFilter}`);
  console.log(`  row limit per table: ${limit}`);

  let entryIrQuery = supabaseAdmin
    .from('entry_ir')
    .select('id, user_id, content')
    .order('created_at', { ascending: true })
    .limit(limit);
  if (userIdFilter) entryIrQuery = entryIrQuery.eq('user_id', userIdFilter);

  let eventsQuery = supabaseAdmin
    .from('resolved_events')
    .select('id, user_id, title')
    .order('start_time', { ascending: true })
    .limit(limit);
  if (userIdFilter) eventsQuery = eventsQuery.eq('user_id', userIdFilter);

  let knowledgeQuery = supabaseAdmin
    .from('crystallized_knowledge')
    .select('id, user_id, human_readable_claim')
    .not('status', 'in', '("HISTORICAL","SUPERSEDED")')
    .order('created_at', { ascending: true })
    .limit(limit);
  if (userIdFilter) knowledgeQuery = knowledgeQuery.eq('user_id', userIdFilter);

  let interpretationsQuery = supabaseAdmin
    .from('event_interpretations')
    .select('id, user_id, interpretation')
    .order('written_at', { ascending: true })
    .limit(limit);
  if (userIdFilter) interpretationsQuery = interpretationsQuery.eq('user_id', userIdFilter);

  const [
    { data: entryIrRows, error: entryIrErr },
    { data: eventRows, error: eventErr },
    { data: knowledgeRows, error: knowledgeErr },
    interpretationResult,
  ] = await Promise.all([
    entryIrQuery,
    eventsQuery,
    knowledgeQuery,
    interpretationsQuery,
  ]);

  const interpretationRows = interpretationResult.data;
  const interpretationErr = interpretationResult.error;

  const missingInterpretationsTable =
    interpretationErr?.code === 'PGRST205' ||
    interpretationErr?.message?.includes('event_interpretations');

  if (entryIrErr || eventErr || knowledgeErr) {
    console.error('Failed to load source rows', { entryIrErr, eventErr, knowledgeErr });
    process.exit(1);
  }

  if (interpretationErr && !missingInterpretationsTable) {
    console.error('Failed to load event_interpretations', interpretationErr);
    process.exit(1);
  }

  if (missingInterpretationsTable) {
    console.warn('event_interpretations table not found — skipping interpretation backfill');
  }

  console.log(`\nentry_ir: ${entryIrRows?.length ?? 0}`);
  const entryIrOk = await backfillTable(
    'entry_ir',
    (entryIrRows ?? []).map((r) => ({ user_id: r.user_id, id: r.id, title: r.content })),
    bridgeEntryIr,
  );

  console.log(`\nresolved_events: ${eventRows?.length ?? 0}`);
  const eventsOk = await backfillTable(
    'resolved_events',
    eventRows ?? [],
    bridgeResolvedEvent,
  );

  console.log(`\ncrystallized_knowledge: ${knowledgeRows?.length ?? 0}`);
  const knowledgeOk = await backfillTable(
    'crystallized_knowledge',
    (knowledgeRows ?? []).map((r) => ({
      user_id: r.user_id,
      id: r.id,
      title: r.human_readable_claim,
    })),
    bridgeCrystallizedKnowledge,
  );

  console.log(`\nevent_interpretations: ${interpretationRows?.length ?? 0}`);
  const interpretationsOk = missingInterpretationsTable
    ? 0
    : await backfillTable(
        'event_interpretations',
        (interpretationRows ?? []).map((r) => ({
          user_id: r.user_id,
          id: r.id,
          title: r.interpretation,
        })),
        bridgeEventInterpretation,
      );

  console.log('\nDone.');
  console.log({
    entry_ir: entryIrOk,
    resolved_events: eventsOk,
    crystallized_knowledge: knowledgeOk,
    event_interpretations: interpretationsOk,
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
