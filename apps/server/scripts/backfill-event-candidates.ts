/**
 * One-off: retroactively run the existing eventCandidateService.processResolvedEvent()
 * over existing resolved_events rows, in chronological order, so that event_candidates
 * gets populated with real detection output (the table is currently empty because all
 * resolved_events were created via batch import, bypassing the live ingestion hook).
 *
 * This calls ONLY existing, already-tested service code — no new detection logic.
 *
 * Usage: npx tsx scripts/backfill-event-candidates.ts
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '../..');
dotenv.config({ path: resolve(rootDir, '.env') });
dotenv.config({ path: resolve(rootDir, '.env.development') });

import { supabaseAdmin } from '../src/services/supabaseClient';
import { eventCandidateService } from '../src/services/eventCandidates/eventCandidateService';

async function main() {
  const { data: events, error } = await supabaseAdmin
    .from('resolved_events')
    .select('id, user_id, title, start_time')
    .order('start_time', { ascending: true });

  if (error) {
    console.error('Failed to load resolved_events:', error);
    process.exit(1);
  }

  console.log(`Found ${events?.length ?? 0} resolved_events. Processing in chronological order...`);

  for (const ev of events ?? []) {
    console.log(`  -> processing "${ev.title}" (user=${ev.user_id}, start_time=${ev.start_time})`);
    await eventCandidateService.processResolvedEvent(ev.user_id, ev.id);
  }

  const { data: candidates } = await supabaseAdmin
    .from('event_candidates')
    .select('canonical_title, occurrence_count, continuity_strength, timeline_candidate, dominant_entity_names')
    .order('continuity_strength', { ascending: false });

  console.log(`\nResulting event_candidates rows: ${candidates?.length ?? 0}`);
  for (const c of candidates ?? []) {
    console.log(
      `  - "${c.canonical_title}" occ=${c.occurrence_count} strength=${c.continuity_strength.toFixed(2)} timeline_candidate=${c.timeline_candidate} entities=[${c.dominant_entity_names.join(', ')}]`,
    );
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
