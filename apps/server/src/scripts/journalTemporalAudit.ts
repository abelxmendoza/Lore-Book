#!/usr/bin/env tsx
/**
 * Journal temporal dry-run audit.
 *
 * Default never mutates. Tenant-scoped via --user-id.
 *
 * Usage:
 *   npm run journal-temporal:audit -- --user-id <uuid>
 */

import { config } from 'dotenv';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../../../../.env') });

import { auditLegacyJournalTemporalRows } from '../services/temporal/legacyJournalTemporalClassifier';
import { supabaseAdmin } from '../services/supabaseClient';

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const userId = argValue('--user-id') || process.env.TARGET_USER_ID || '';
  if (!userId) {
    console.error('Required: --user-id <uuid>');
    process.exit(1);
  }

  const apply = process.argv.includes('--apply') || process.argv.includes('--execute');
  if (apply) {
    console.error('This audit never mutates. --apply is refused.');
    process.exit(1);
  }

  const { data: journals, error } = await supabaseAdmin
    .from('journal_entries')
    .select('id, user_id, date, created_at, content, metadata, time_precision, time_confidence')
    .eq('user_id', userId)
    .limit(5000);
  if (error) throw error;

  const journalIds = (journals ?? []).map((row) => row.id);
  const eventsByJournal = new Map<string, { id: string; start_time: string | null }>();
  if (journalIds.length > 0) {
    const { data: events } = await supabaseAdmin
      .from('resolved_events')
      .select('id, start_time, metadata')
      .eq('user_id', userId)
      .in('metadata->>source_entry_id', journalIds);
    for (const event of events ?? []) {
      const sourceId =
        event.metadata && typeof event.metadata === 'object'
          ? (event.metadata as { source_entry_id?: string }).source_entry_id
          : undefined;
      if (sourceId && !eventsByJournal.has(sourceId)) {
        eventsByJournal.set(sourceId, {
          id: event.id,
          start_time: typeof event.start_time === 'string' ? event.start_time : null,
        });
      }
    }
  }

  const rows = (journals ?? []).map((journal) => {
    const meta = (journal.metadata ?? {}) as Record<string, unknown>;
    const linked = eventsByJournal.get(journal.id);
    return {
      journalEntryId: journal.id,
      userId: journal.user_id,
      storedDate: typeof journal.date === 'string' ? journal.date : null,
      createdAt: typeof journal.created_at === 'string' ? journal.created_at : null,
      content: typeof journal.content === 'string' ? journal.content : null,
      temporalSource: typeof meta.temporal_source === 'string' ? meta.temporal_source : null,
      temporalPrecision:
        typeof meta.temporal_precision === 'string'
          ? meta.temporal_precision
          : typeof journal.time_precision === 'string'
            ? journal.time_precision
            : null,
      timeConfidence: journal.time_confidence == null ? null : Number(journal.time_confidence),
      canonicalEventId: linked?.id ?? null,
      canonicalOccurredAt: linked?.start_time ?? null,
    };
  });

  const result = auditLegacyJournalTemporalRows(userId, rows);
  console.log(JSON.stringify(result, null, 2));
  console.log(`mutated: ${result.mutated}`);
  console.log(`counts: ${JSON.stringify(result.counts)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
