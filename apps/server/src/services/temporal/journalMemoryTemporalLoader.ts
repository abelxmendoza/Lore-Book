/**
 * Batch-load journal clocks for character memories / hydrated story cards.
 * Tenant-scoped. No full-history scans — caller supplies the entry ids.
 */

import { supabaseAdmin } from '../supabaseClient';

import {
  occurrenceDateOrEmpty,
  resolveJournalMemoryTemporal,
  type JournalMemoryClocks,
} from './journalMemoryTemporal';

export type SharedMemoryTemporalRef = {
  id: string;
  entry_id: string;
  date: string;
  summary?: string;
  occurredAt?: string | null;
  mentionedAt?: string | null;
  recordedAt?: string | null;
  occurrenceStatus?: JournalMemoryClocks['occurrenceStatus'];
  canonicalEventId?: string | null;
};

async function loadCanonicalEventIds(
  userId: string,
  entryIds: string[],
): Promise<Map<string, { eventId: string; occurredAt: string | null }>> {
  const linked = new Map<string, { eventId: string; occurredAt: string | null }>();
  if (entryIds.length === 0) return linked;
  try {
    const { data: links, error } = await supabaseAdmin
      .from('arc_event_links')
      .select('journal_entry_id, resolved_event_id')
      .eq('user_id', userId)
      .in('journal_entry_id', entryIds)
      .not('resolved_event_id', 'is', null);
    if (error || !links?.length) return linked;

    const eventIds = [...new Set(links.map((row) => row.resolved_event_id as string).filter(Boolean))];
    const { data: events } = eventIds.length
      ? await supabaseAdmin
          .from('resolved_events')
          .select('id, start_time')
          .eq('user_id', userId)
          .in('id', eventIds)
      : { data: [] as Array<{ id: string; start_time: string | null }> };

    const startById = new Map((events ?? []).map((event) => [event.id, event.start_time ?? null]));
    for (const link of links) {
      const journalId = link.journal_entry_id as string;
      const eventId = link.resolved_event_id as string;
      if (!journalId || !eventId) continue;
      linked.set(journalId, { eventId, occurredAt: startById.get(eventId) ?? null });
    }
  } catch {
    return linked;
  }
  return linked;
}

export async function resolveJournalEntryClocks(
  userId: string,
  entryIds: string[],
): Promise<Map<string, JournalMemoryClocks>> {
  const uniqueIds = [...new Set(entryIds.filter(Boolean))];
  const out = new Map<string, JournalMemoryClocks>();
  if (uniqueIds.length === 0) return out;

  const [{ data: entries }, { data: indexRows }, canonical] = await Promise.all([
    supabaseAdmin
      .from('journal_entries')
      .select('id, date, created_at, source, metadata')
      .eq('user_id', userId)
      .in('id', uniqueIds),
    supabaseAdmin
      .from('chronology_index')
      .select('journal_entry_id, time_precision')
      .eq('user_id', userId)
      .in('journal_entry_id', uniqueIds),
    loadCanonicalEventIds(userId, uniqueIds),
  ]);

  const indexById = new Map(
    (indexRows ?? []).map((row) => [row.journal_entry_id as string, row]),
  );

  for (const entry of entries ?? []) {
    const meta = (entry.metadata ?? {}) as Record<string, unknown>;
    const index = indexById.get(entry.id);
    const linked = canonical.get(entry.id);
    const clocks = resolveJournalMemoryTemporal({
      journalEntryId: entry.id,
      journalDate: typeof entry.date === 'string' ? entry.date : null,
      recordedAt: typeof entry.created_at === 'string' ? entry.created_at : null,
      sourceType: typeof entry.source === 'string' ? entry.source : null,
      temporalSource:
        (typeof meta.temporal_source === 'string' && meta.temporal_source)
        || null,
      precision:
        (typeof meta.time_precision === 'string' && meta.time_precision)
        || (typeof index?.time_precision === 'string' && index.time_precision)
        || null,
      canonicalOccurredAt: linked?.occurredAt ?? null,
      canonicalEventId: linked?.eventId ?? null,
    });
    out.set(entry.id, clocks);
  }

  return out;
}

export function sharedMemoryFromLink(
  mem: { id: string; journal_entry_id: string; created_at?: string | null; summary?: string | null },
  clocks: JournalMemoryClocks | undefined,
): SharedMemoryTemporalRef {
  const fallback = resolveJournalMemoryTemporal({
    journalEntryId: mem.journal_entry_id,
    recordedAt: mem.created_at ?? null,
    sourceType: 'chat',
  });
  const resolved = clocks ?? fallback;
  return {
    id: mem.id,
    entry_id: mem.journal_entry_id,
    date: occurrenceDateOrEmpty(resolved),
    summary: mem.summary || undefined,
    occurredAt: resolved.occurredAt,
    mentionedAt: resolved.mentionedAt,
    recordedAt: resolved.recordedAt,
    occurrenceStatus: resolved.occurrenceStatus,
    canonicalEventId: resolved.canonicalEventId,
  };
}

export async function mapCharacterMemoriesToTemporalRefs(
  userId: string,
  memories: Array<{ id: string; journal_entry_id: string; created_at?: string | null; summary?: string | null }>,
): Promise<SharedMemoryTemporalRef[]> {
  const clocks = await resolveJournalEntryClocks(
    userId,
    memories.map((mem) => mem.journal_entry_id),
  );
  return memories.map((mem) => sharedMemoryFromLink(mem, clocks.get(mem.journal_entry_id)));
}
