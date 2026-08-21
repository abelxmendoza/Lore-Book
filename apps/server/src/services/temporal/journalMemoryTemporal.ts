/**
 * Journal/memory timestamps are not automatically occurrence timestamps.
 *
 * Reuses CanonicalTemporalModel. Does not invent a second clock.
 * Recording/mention time may be exact; that exactness must not become life chronology.
 */

import {
  canonicalTemporalFromLegacy,
  type CanonicalTemporalModel,
} from './canonicalTemporalModel';
import type { TemporalPrecision, TemporalSource } from './temporalEvidence';

export type OccurrenceStatus = 'confirmed' | 'range' | 'unresolved';

export type JournalMemoryTemporalInput = {
  journalId?: string | null;
  canonicalEventId?: string | null;
  content?: string | null;
  title?: string | null;
  /** journal_entries.date / memory.date — historically overloaded. */
  claimedDate?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  mentionedAt?: string | null;
  temporalSource?: string | null;
  timePrecision?: string | null;
  timeConfidence?: number | null;
  canonicalOccurredAt?: string | null;
  canonicalPrecision?: string | null;
  canonicalTemporalSource?: string | null;
};

export type JournalMemoryTemporalView = {
  occurredAt: string | null;
  mentionedAt: string | null;
  recordedAt: string | null;
  precision: TemporalPrecision;
  temporalSource: TemporalSource;
  occurrenceStatus: OccurrenceStatus;
  recordingFallbackRejected: boolean;
  canonicalEventId: string | null;
  journalSourceId: string | null;
  canonicalLinkage: boolean;
  dedupeDecision: 'keep_canonical_event' | 'keep_journal' | 'undated_provenance';
  unresolvedReason: string | null;
  temporal: CanonicalTemporalModel;
};

const RECORDING_SOURCES = new Set([
  'recording_fallback',
  'default',
  'system_default',
  'system',
  'unresolved',
]);
const RANGE_PRECISIONS = new Set(['week', 'month', 'season', 'quarter', 'year', 'approximate']);
const RELATIVE_PAST =
  /\b(last month|last summer|last year|a few weeks (?:ago|earlier)|weeks earlier|years ago|i don'?t remember when|don'?t remember when)\b/i;
const SEQUENCE_ONLY = /\b(before that|after that|then we|earlier that|later that)\b/i;
const SAME_DAY_EVENT =
  /\b(i (?:went|saw|met|was at|had)|we (?:went|saw|met|were at))\b/i;

function asSource(value: string | null | undefined): TemporalSource | null {
  switch (value) {
    case 'user_corrected':
    case 'user_stated':
    case 'document_stated':
    case 'relative_expression':
    case 'context_inferred':
    case 'recording_fallback':
      return value;
    default:
      return null;
  }
}

function asPrecision(value: string | null | undefined): TemporalPrecision {
  switch (value) {
    case 'exact':
    case 'time_of_day':
    case 'date':
    case 'week':
    case 'month':
    case 'season':
    case 'quarter':
    case 'year':
    case 'approximate':
    case 'unknown':
      return value;
    case 'day':
      return 'date';
    default:
      return 'unknown';
  }
}

export function utcDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso.slice(0, 10) || null;
  return new Date(parsed).toISOString().slice(0, 10);
}

export function sameUtcDay(left?: string | null, right?: string | null): boolean {
  const a = utcDay(left);
  const b = utcDay(right);
  return Boolean(a && b && a === b);
}

function looksLikeRecordingDefault(input: JournalMemoryTemporalInput): boolean {
  const source = (input.temporalSource ?? '').toLowerCase();
  if (RECORDING_SOURCES.has(source)) return true;
  if ((input.timeConfidence ?? 1) <= 0.25 && sameUtcDay(input.claimedDate, input.createdAt)) return true;
  return false;
}

function unlabeledSameDayRecording(input: JournalMemoryTemporalInput, text: string): boolean {
  if (input.temporalSource) return false;
  if (!sameUtcDay(input.claimedDate, input.createdAt)) return false;
  if (SAME_DAY_EVENT.test(text) && !RELATIVE_PAST.test(text)) return false;
  return true;
}

function finish(
  partial: Omit<JournalMemoryTemporalView, 'temporal'>,
): JournalMemoryTemporalView {
  const temporal = canonicalTemporalFromLegacy({
    id: partial.canonicalEventId ?? partial.journalSourceId,
    occurredAt: partial.occurredAt,
    mentionedAt: partial.mentionedAt,
    recordedAt: partial.recordedAt,
    precision: partial.precision,
    source: partial.temporalSource,
    status:
      partial.occurrenceStatus === 'confirmed'
        ? 'anchored'
        : partial.occurrenceStatus === 'range'
          ? 'approximate'
          : 'unanchored',
    confidence:
      partial.occurrenceStatus === 'unresolved'
        ? 0.2
        : partial.occurrenceStatus === 'range'
          ? 0.55
          : 0.85,
    sourceLabel: partial.canonicalLinkage ? 'resolved_event' : 'journal_entry',
  });
  return { ...partial, temporal };
}

/**
 * Split OCCURRED_AT / MENTIONED_AT / RECORDED_AT for one journal or memory row.
 * Canonical event occurrence always wins when a stable event id is linked.
 */
export function classifyJournalMemoryTemporal(
  input: JournalMemoryTemporalInput,
): JournalMemoryTemporalView {
  const journalSourceId = input.journalId ?? null;
  const canonicalEventId = input.canonicalEventId ?? null;
  const recordedAt = input.createdAt ?? null;
  const mentionedAt = input.mentionedAt ?? recordedAt;
  const text = `${input.title ?? ''} ${input.content ?? ''}`.trim();
  const relativePast = RELATIVE_PAST.test(text);
  const sequenceOnly = SEQUENCE_ONLY.test(text) && !input.canonicalOccurredAt;
  const recordingDefault = looksLikeRecordingDefault(input);

  if (canonicalEventId && input.canonicalOccurredAt) {
    const precision = asPrecision(input.canonicalPrecision ?? input.timePrecision);
    const range = RANGE_PRECISIONS.has(precision);
    return finish({
      occurredAt: input.canonicalOccurredAt,
      mentionedAt,
      recordedAt,
      precision,
      temporalSource: asSource(input.canonicalTemporalSource) ?? 'user_stated',
      occurrenceStatus: range ? 'range' : 'confirmed',
      recordingFallbackRejected: recordingDefault || !sameUtcDay(input.claimedDate, input.canonicalOccurredAt),
      canonicalEventId,
      journalSourceId,
      canonicalLinkage: true,
      dedupeDecision: 'keep_canonical_event',
      unresolvedReason: null,
    });
  }

  if (relativePast && recordingDefault) {
    return finish({
      occurredAt: null,
      mentionedAt,
      recordedAt,
      precision: 'unknown',
      temporalSource: 'recording_fallback',
      occurrenceStatus: 'unresolved',
      recordingFallbackRejected: true,
      canonicalEventId,
      journalSourceId,
      canonicalLinkage: Boolean(canonicalEventId),
      dedupeDecision: canonicalEventId ? 'keep_canonical_event' : 'undated_provenance',
      unresolvedReason: 'relative_occurrence_with_recording_timestamp',
    });
  }

  if (/\b(i don'?t remember when|don'?t remember when)\b/i.test(text)) {
    return finish({
      occurredAt: null,
      mentionedAt,
      recordedAt,
      precision: 'unknown',
      temporalSource: 'recording_fallback',
      occurrenceStatus: 'unresolved',
      recordingFallbackRejected: true,
      canonicalEventId,
      journalSourceId,
      canonicalLinkage: Boolean(canonicalEventId),
      dedupeDecision: 'undated_provenance',
      unresolvedReason: 'unknown_occurrence',
    });
  }

  if (sequenceOnly && recordingDefault) {
    return finish({
      occurredAt: null,
      mentionedAt,
      recordedAt,
      precision: 'unknown',
      temporalSource: 'recording_fallback',
      occurrenceStatus: 'unresolved',
      recordingFallbackRejected: true,
      canonicalEventId,
      journalSourceId,
      canonicalLinkage: Boolean(canonicalEventId),
      dedupeDecision: 'undated_provenance',
      unresolvedReason: 'sequence_only',
    });
  }

  if (recordingDefault || unlabeledSameDayRecording(input, text) || !input.claimedDate) {
    return finish({
      occurredAt: null,
      mentionedAt,
      recordedAt,
      precision: 'unknown',
      temporalSource: 'recording_fallback',
      occurrenceStatus: 'unresolved',
      recordingFallbackRejected: Boolean(input.claimedDate),
      canonicalEventId,
      journalSourceId,
      canonicalLinkage: Boolean(canonicalEventId),
      dedupeDecision: canonicalEventId ? 'keep_canonical_event' : 'undated_provenance',
      unresolvedReason: input.claimedDate ? 'recording_timestamp_is_not_occurrence' : 'unknown_occurrence',
    });
  }

  const precision = asPrecision(input.timePrecision);
  const source = asSource(input.temporalSource) ?? 'user_stated';
  const range = RANGE_PRECISIONS.has(precision);
  return finish({
    occurredAt: input.claimedDate,
    mentionedAt,
    recordedAt,
    precision: range ? precision : precision === 'unknown' ? 'date' : precision,
    temporalSource: source,
    occurrenceStatus: range ? 'range' : 'confirmed',
    recordingFallbackRejected: false,
    canonicalEventId,
    journalSourceId,
    canonicalLinkage: Boolean(canonicalEventId),
    dedupeDecision: canonicalEventId ? 'keep_canonical_event' : 'keep_journal',
    unresolvedReason: null,
  });
}

export function occurrenceForChronology(view: JournalMemoryTemporalView): string | null {
  return view.occurredAt;
}

export function explainJournalMemoryTemporal(view: JournalMemoryTemporalView): {
  canonicalItemId: string | null;
  journalSourceId: string | null;
  occurredAt: string | null;
  mentionedAt: string | null;
  recordedAt: string | null;
  precision: TemporalPrecision;
  temporalSource: TemporalSource;
  recordingFallbackRejected: boolean;
  canonicalEventLinkage: boolean;
  dedupeDecision: JournalMemoryTemporalView['dedupeDecision'];
  unresolvedReason: string | null;
} {
  return {
    canonicalItemId: view.canonicalEventId,
    journalSourceId: view.journalSourceId,
    occurredAt: view.occurredAt,
    mentionedAt: view.mentionedAt,
    recordedAt: view.recordedAt,
    precision: view.precision,
    temporalSource: view.temporalSource,
    recordingFallbackRejected: view.recordingFallbackRejected,
    canonicalEventLinkage: view.canonicalLinkage,
    dedupeDecision: view.dedupeDecision,
    unresolvedReason: view.unresolvedReason,
  };
}

export function happenedPhrase(view: JournalMemoryTemporalView): string {
  if (!view.occurredAt) return 'when this happened is unknown';
  if (view.occurrenceStatus === 'range') return `this happened around ${utcDay(view.occurredAt)}`;
  return `this happened on ${utcDay(view.occurredAt)}`;
}

export function wroteAboutPhrase(view: JournalMemoryTemporalView): string {
  const when = utcDay(view.mentionedAt ?? view.recordedAt);
  if (!when) return 'when you wrote about this is unknown';
  return `you wrote about this on ${when}`;
}

export type JournalLikeTemporalEntry = {
  id?: string | null;
  date?: string | null;
  created_at?: string | null;
  timestamp?: string | null;
  content?: string | null;
  text?: string | null;
  metadata?: Record<string, unknown> | null;
  time_precision?: string | null;
  time_confidence?: number | null;
};

export type JournalExtractorClocks = {
  occurredAt: string | null;
  mentionedAt: string | null;
  recordedAt: string | null;
  /** Mention/recording clock for observation-typed extractors. Never invented as NOW(). */
  observedAt: string | null;
};

/**
 * Split journal clocks for extractors.
 * Occurrence consumers must use occurredAt only.
 * Observation/mention consumers use observedAt (created_at / mentioned), never date||created_at.
 */
export function clocksFromJournalEntry(entry: JournalLikeTemporalEntry): JournalExtractorClocks {
  const meta = entry.metadata ?? {};
  const view = classifyJournalMemoryTemporal({
    journalId: entry.id,
    content: entry.content ?? entry.text,
    claimedDate: entry.date ?? null,
    createdAt: entry.created_at ?? null,
    temporalSource: typeof meta.temporal_source === 'string' ? meta.temporal_source : null,
    timePrecision: entry.time_precision,
    timeConfidence: entry.time_confidence,
  });
  return {
    occurredAt: view.occurredAt,
    mentionedAt: view.mentionedAt,
    recordedAt: view.recordedAt,
    observedAt: view.mentionedAt ?? view.recordedAt ?? entry.created_at ?? null,
  };
}
