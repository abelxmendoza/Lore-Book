/**
 * Tenant-scoped journal occurrence repair.
 * Default is dry-run. Apply requires an explicit user id and { apply: true }.
 */

import { supabaseAdmin } from '../supabaseClient';
import { isNearInstant, resolveJournalMemoryTemporal } from './journalMemoryTemporal';
import { resolveJournalEntryClocks } from './journalMemoryTemporalLoader';
import { isNotNullViolation } from './journalOccurrenceWrite';

export type JournalOccurrenceRepairAction =
  | 'KEEP'
  | 'CLEAR_OCCURRENCE'
  | 'LINK_CANONICAL'
  | 'MARK_UNRESOLVED'
  | 'NO_ACTION_AMBIGUOUS';

export type JournalOccurrenceRepairRow = {
  journalEntryId: string;
  storedDate: string | null;
  createdAt: string | null;
  timePrecision: string | null;
  timeConfidence: number | null;
  temporalSource: string | null;
  canonicalEventId: string | null;
  canonicalOccurredAt: string | null;
  classification: 'confirmed_occurrence' | 'recording_fallback' | 'ambiguous_legacy' | 'unresolved';
  proposedAction: JournalOccurrenceRepairAction;
  reason: string;
  /** Identifiable historical writer when metadata/source is present. Null if unknown. */
  legacySourceHint: string | null;
};

export type JournalOccurrenceRepairReport = {
  userId: string;
  dryRun: boolean;
  rows: JournalOccurrenceRepairRow[];
  writes: number;
};

function sameUtcDay(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.slice(0, 10) === b.slice(0, 10);
}

function photoHasExif(meta: Record<string, unknown>): boolean {
  const photoMeta = (meta.photoMetadata ?? {}) as Record<string, unknown>;
  return Boolean(photoMeta.dateTimeOriginal || photoMeta.dateTime);
}

export function legacyJournalSourceHint(
  source: string | null,
  meta: Record<string, unknown>,
): string | null {
  if (source === 'chatgpt_import' || meta.import_channel === 'chatgpt') return 'chatgpt_import';
  if (meta.provenance === 'resume_lore_population' || meta.source === 'resume_upload') return 'resume_upload';
  if (meta.onboarding === true || meta.type === 'import_wizard') return 'onboarding';
  if (source === 'photo' && !photoHasExif(meta)) return 'photo_no_exif';
  if (source === 'photo' && photoHasExif(meta)) return 'photo_exif';
  if (source === 'x' || meta.provider === 'x' || meta.x_post_id) return 'x_import';
  if (source === 'calendar' || meta.fromCalendar) return 'calendar';
  if (source === 'document_upload' && meta.imported) return 'document_upload';
  return null;
}

function classifyRow(input: {
  date: string | null;
  createdAt: string | null;
  temporalSource: string | null;
  canonicalEventId: string | null;
  canonicalOccurredAt: string | null;
  source: string | null;
  metadata: Record<string, unknown>;
  legacySourceHint: string | null;
}): Pick<JournalOccurrenceRepairRow, 'classification' | 'proposedAction' | 'reason'> {
  if (input.canonicalOccurredAt && input.canonicalEventId) {
    if (input.date === input.canonicalOccurredAt) {
      return {
        classification: 'confirmed_occurrence',
        proposedAction: 'KEEP',
        reason: 'Canonical event occurrence already stored on the journal row.',
      };
    }
    return {
      classification: 'confirmed_occurrence',
      proposedAction: 'LINK_CANONICAL',
      reason: 'Stable canonical event occurrence wins; journal date stays provenance unless it already matches.',
    };
  }
  if (input.temporalSource === 'recording_fallback' || (!input.date && input.createdAt)) {
    return {
      classification: input.date ? 'recording_fallback' : 'unresolved',
      proposedAction: input.date ? 'CLEAR_OCCURRENCE' : 'MARK_UNRESOLVED',
      reason: 'Strong evidence that stored date is recording time, not occurrence.',
    };
  }
  const importStampedToday =
    Boolean(input.legacySourceHint) &&
    sameUtcDay(input.date, input.createdAt) &&
    (input.legacySourceHint === 'chatgpt_import' ||
      input.legacySourceHint === 'onboarding' ||
      input.legacySourceHint === 'photo_no_exif' ||
      (input.legacySourceHint === 'resume_upload' && !input.metadata.employment && !input.metadata.education && !input.metadata.project));
  if (importStampedToday && input.temporalSource !== 'document_stated' && input.temporalSource !== 'user_stated') {
    return {
      classification: 'recording_fallback',
      proposedAction: 'CLEAR_OCCURRENCE',
      reason: `Legacy ${input.legacySourceHint} writer stamped import/upload time as occurrence.`,
    };
  }
  if (input.legacySourceHint === 'chatgpt_import' && input.date && input.createdAt && sameUtcDay(input.date, input.createdAt)) {
    return {
      classification: 'recording_fallback',
      proposedAction: 'CLEAR_OCCURRENCE',
      reason: 'Legacy chatgpt_import always wrote import-day as journal.date.',
    };
  }
  if (input.date && input.createdAt && isNearInstant(input.date, input.createdAt) && !input.temporalSource) {
    return {
      classification: 'ambiguous_legacy',
      proposedAction: 'NO_ACTION_AMBIGUOUS',
      reason: 'date == created_at without temporal_source; could be a same-day event. Leave untouched.',
    };
  }
  if (!input.date) {
    return {
      classification: 'unresolved',
      proposedAction: 'MARK_UNRESOLVED',
      reason: 'No occurrence stored.',
    };
  }
  return {
    classification: 'confirmed_occurrence',
    proposedAction: 'KEEP',
    reason: 'Occurrence differs from recording time or is explicitly sourced.',
  };
}

export async function classifyJournalOccurrenceRows(userId: string): Promise<JournalOccurrenceRepairRow[]> {
  if (!userId) throw new Error('userId is required');
  const { data: entries, error } = await supabaseAdmin
    .from('journal_entries')
    .select('id, date, created_at, time_precision, time_confidence, source, metadata')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const clocks = await resolveJournalEntryClocks(
    userId,
    (entries ?? []).map((entry) => entry.id as string),
  );

  return (entries ?? []).map((entry) => {
    const meta = (entry.metadata ?? {}) as Record<string, unknown>;
    const resolved = clocks.get(entry.id) ?? resolveJournalMemoryTemporal({
      journalEntryId: entry.id,
      journalDate: entry.date,
      recordedAt: entry.created_at,
      sourceType: entry.source,
      temporalSource: typeof meta.temporal_source === 'string' ? meta.temporal_source : null,
    });
    const storedTemporalSource = typeof meta.temporal_source === 'string' ? meta.temporal_source : null;
    const legacySourceHint = legacyJournalSourceHint(
      typeof entry.source === 'string' ? entry.source : null,
      meta,
    );
    const classified = classifyRow({
      date: entry.date ?? null,
      createdAt: entry.created_at ?? null,
      temporalSource: storedTemporalSource,
      canonicalEventId: resolved.canonicalEventId,
      canonicalOccurredAt: resolved.canonicalEventId ? resolved.occurredAt : null,
      source: typeof entry.source === 'string' ? entry.source : null,
      metadata: meta,
      legacySourceHint,
    });
    return {
      journalEntryId: entry.id,
      storedDate: entry.date ?? null,
      createdAt: entry.created_at ?? null,
      timePrecision: entry.time_precision ?? null,
      timeConfidence: entry.time_confidence == null ? null : Number(entry.time_confidence),
      temporalSource: storedTemporalSource ?? resolved.temporalSource,
      canonicalEventId: resolved.canonicalEventId,
      canonicalOccurredAt: resolved.canonicalEventId ? resolved.occurredAt : null,
      legacySourceHint,
      ...classified,
    };
  });
}

export async function repairJournalOccurrenceRows(
  userId: string,
  options: { apply?: boolean } = {},
): Promise<JournalOccurrenceRepairReport> {
  const dryRun = options.apply !== true;
  const rows = await classifyJournalOccurrenceRows(userId);
  if (dryRun) {
    return { userId, dryRun: true, rows, writes: 0 };
  }

  let writes = 0;
  for (const row of rows) {
    if (row.proposedAction !== 'CLEAR_OCCURRENCE' && row.proposedAction !== 'MARK_UNRESOLVED' && row.proposedAction !== 'LINK_CANONICAL') {
      continue;
    }
    const { data: existing } = await supabaseAdmin
      .from('journal_entries')
      .select('metadata')
      .eq('user_id', userId)
      .eq('id', row.journalEntryId)
      .maybeSingle();
    const metadata: Record<string, unknown> = {
      ...((existing?.metadata ?? {}) as Record<string, unknown>),
      temporal_source: row.proposedAction === 'LINK_CANONICAL' ? 'user_stated' : 'recording_fallback',
      canonicalEventId: row.canonicalEventId,
      occurredAt: row.proposedAction === 'LINK_CANONICAL' ? row.canonicalOccurredAt : null,
      occurrenceStatus: row.proposedAction === 'LINK_CANONICAL' ? 'confirmed' : 'unresolved',
    };
    const patch: Record<string, unknown> = {
      metadata,
      time_confidence: row.proposedAction === 'LINK_CANONICAL' ? 0.9 : 0,
    };
    if (row.proposedAction === 'LINK_CANONICAL' && row.canonicalOccurredAt) {
      patch.date = row.canonicalOccurredAt;
      patch.timestamp = row.canonicalOccurredAt;
    } else {
      patch.date = null;
      patch.timestamp = null;
      patch.time_precision = 'approximate';
    }
    const { error } = await supabaseAdmin
      .from('journal_entries')
      .update(patch)
      .eq('user_id', userId)
      .eq('id', row.journalEntryId);
    if (error && isNotNullViolation(error) && patch.date == null) {
      metadata.occurrence_compat = 'not_null_date_column';
      const retry = await supabaseAdmin
        .from('journal_entries')
        .update({ metadata, time_confidence: 0, time_precision: 'approximate' })
        .eq('user_id', userId)
        .eq('id', row.journalEntryId);
      if (retry.error) throw retry.error;
      writes += 1;
      continue;
    }
    if (error) throw error;
    writes += 1;
  }

  return { userId, dryRun: false, rows, writes };
}
