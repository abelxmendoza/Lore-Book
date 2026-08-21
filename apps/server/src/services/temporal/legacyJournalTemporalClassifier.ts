/**
 * Conservative classifier for historical journal temporal rows.
 *
 * date == created_at without metadata.temporal_source is AMBIGUOUS.
 * Do not assume every matching timestamp is a fake recording fallback.
 * Never mutates rows.
 */

import { classifyJournalMemoryTemporal, sameUtcDay } from './journalMemoryTemporal';

export type LegacyJournalTemporalStatus =
  | 'confirmed_occurrence'
  | 'recording_fallback'
  | 'invalid_occurrence_fallback'
  | 'ambiguous_legacy'
  | 'unresolved'
  | 'canonical_override';

export type LegacyJournalProposedAction = 'none' | 'clear_occurrence' | 'keep_occurrence' | 'prefer_canonical';

export type LegacyJournalTemporalRow = {
  journalEntryId: string;
  userId?: string | null;
  storedDate?: string | null;
  createdAt?: string | null;
  content?: string | null;
  temporalSource?: string | null;
  temporalPrecision?: string | null;
  timeConfidence?: number | null;
  canonicalEventId?: string | null;
  canonicalOccurredAt?: string | null;
};

export type LegacyJournalTemporalReport = {
  journalEntryId: string;
  storedDate: string | null;
  createdAt: string | null;
  temporalSource: string | null;
  temporalPrecision: string | null;
  canonicalEventId: string | null;
  canonicalOccurredAt: string | null;
  classification: LegacyJournalTemporalStatus;
  proposedAction: LegacyJournalProposedAction;
  reason: string;
};

const UNKNOWN_TEXT = /\b((i )?don'?t (remember|know) when|not sure when (this|it) happened)\b/i;

export function classifyLegacyJournalTemporalRow(
  row: LegacyJournalTemporalRow,
): LegacyJournalTemporalReport {
  const storedDate = row.storedDate ?? null;
  const createdAt = row.createdAt ?? null;
  const temporalSource = row.temporalSource ?? null;
  const temporalPrecision = row.temporalPrecision ?? null;
  const canonicalEventId = row.canonicalEventId ?? null;
  const canonicalOccurredAt = row.canonicalOccurredAt ?? null;

  const base = {
    journalEntryId: row.journalEntryId,
    storedDate,
    createdAt,
    temporalSource,
    temporalPrecision,
    canonicalEventId,
    canonicalOccurredAt,
  };

  if (canonicalEventId && canonicalOccurredAt) {
    return {
      ...base,
      classification: 'canonical_override',
      proposedAction: 'prefer_canonical',
      reason:
        'Canonical resolved_event.start_time wins via source_entry_id. Journal compatibility date is not rewritten.',
    };
  }

  if (!storedDate) {
    return {
      ...base,
      classification: 'unresolved',
      proposedAction: 'none',
      reason: 'Occurrence is already null; recording time is separate.',
    };
  }

  if (temporalSource === 'recording_fallback' || temporalSource === 'unresolved') {
    return {
      ...base,
      classification: 'invalid_occurrence_fallback',
      proposedAction: 'clear_occurrence',
      reason: 'temporal_source marks stored date as recording, not occurrence.',
    };
  }

  if (UNKNOWN_TEXT.test(row.content ?? '')) {
    return {
      ...base,
      classification: 'unresolved',
      proposedAction: 'clear_occurrence',
      reason: 'Text states occurrence is unknown; stored date is not biography.',
    };
  }

  const view = classifyJournalMemoryTemporal({
    journalId: row.journalEntryId,
    content: row.content,
    claimedDate: storedDate,
    createdAt,
    temporalSource,
    timePrecision: temporalPrecision,
    timeConfidence: row.timeConfidence,
    canonicalEventId,
    canonicalOccurredAt,
  });

  if (view.occurrenceStatus === 'confirmed' || view.occurrenceStatus === 'range') {
    return {
      ...base,
      classification: 'confirmed_occurrence',
      proposedAction: 'keep_occurrence',
      reason: view.occurrenceStatus === 'range'
        ? 'Approximate occurrence is evidenced and distinct from recording-as-occurrence fallback.'
        : 'Stored date is treated as evidenced occurrence.',
    };
  }

  if (sameUtcDay(storedDate, createdAt) && !temporalSource) {
    return {
      ...base,
      classification: 'ambiguous_legacy',
      proposedAction: 'none',
      reason:
        'Cannot prove whether stored date represented occurrence or recording.',
    };
  }

  if (view.recordingFallbackRejected) {
    return {
      ...base,
      classification: 'recording_fallback',
      proposedAction: 'clear_occurrence',
      reason: view.unresolvedReason ?? 'Recording timestamp is not occurrence.',
    };
  }

  return {
    ...base,
    classification: 'unresolved',
    proposedAction: 'none',
    reason: view.unresolvedReason ?? 'Occurrence remains unresolved.',
  };
}

export type LegacyJournalTemporalAuditResult = {
  userId: string;
  mutated: false;
  rows: LegacyJournalTemporalReport[];
  counts: Record<LegacyJournalTemporalStatus, number>;
};

export function auditLegacyJournalTemporalRows(
  userId: string,
  rows: LegacyJournalTemporalRow[],
): LegacyJournalTemporalAuditResult {
  const scoped = rows.filter((row) => !row.userId || row.userId === userId);
  const reports = scoped.map(classifyLegacyJournalTemporalRow);
  const counts: Record<LegacyJournalTemporalStatus, number> = {
    confirmed_occurrence: 0,
    recording_fallback: 0,
    invalid_occurrence_fallback: 0,
    ambiguous_legacy: 0,
    unresolved: 0,
    canonical_override: 0,
  };
  for (const report of reports) {
    counts[report.classification] += 1;
  }
  return { userId, mutated: false, rows: reports, counts };
}
