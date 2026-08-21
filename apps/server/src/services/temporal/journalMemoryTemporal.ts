/**
 * Journal / memory clocks: occurrence, mention, and recording are distinct.
 *
 * CanonicalTemporalModel remains the occurrence authority. This adapter decides
 * when a journal_entries.date (or character_memories.created_at) is allowed to
 * count as life occurrence versus provenance metadata.
 *
 * Pure module: no DB, no clock reads.
 */

import type { TemporalPrecision, TemporalSource } from './temporalEvidence';
import {
  canonicalTemporalFromLegacy,
  type CanonicalTemporalModel,
} from './canonicalTemporalModel';

export type JournalOccurrenceStatus = 'confirmed' | 'range' | 'unresolved';

export type JournalMemoryClocks = {
  occurredAt: string | null;
  mentionedAt: string | null;
  recordedAt: string | null;
  temporalSource: TemporalSource;
  occurrenceStatus: JournalOccurrenceStatus;
  precision: TemporalPrecision;
  canonicalEventId: string | null;
  journalEntryId: string | null;
  temporal: CanonicalTemporalModel;
};

export type JournalMemoryTemporalInput = {
  journalEntryId?: string | null;
  /** journal_entries.date — often ingest/write time, sometimes occurrence. */
  journalDate?: string | null;
  /** journal_entries.created_at / character_memories.created_at */
  recordedAt?: string | null;
  sourceType?: string | null;
  temporalSource?: string | null;
  precision?: string | null;
  /** Linked resolved_events.start_time — wins over journal.date. */
  canonicalOccurredAt?: string | null;
  canonicalEventId?: string | null;
  canonicalPrecision?: string | null;
};

const NEAR_INSTANT_MS = 2 * 60 * 1000;
const RANGE_PRECISIONS = new Set<TemporalPrecision>([
  'week',
  'month',
  'season',
  'quarter',
  'year',
  'approximate',
]);
const STATED_SOURCES = new Set<TemporalSource>([
  'user_corrected',
  'user_stated',
  'document_stated',
  'relative_expression',
]);

function asSource(value: string | null | undefined): TemporalSource | null {
  const allowed: TemporalSource[] = [
    'user_corrected',
    'user_stated',
    'document_stated',
    'relative_expression',
    'context_inferred',
    'recording_fallback',
  ];
  return allowed.includes(value as TemporalSource) ? (value as TemporalSource) : null;
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

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function calendarDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const day = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

export function isNearInstant(a: string | null | undefined, b: string | null | undefined, windowMs = NEAR_INSTANT_MS): boolean {
  const ma = parseMs(a);
  const mb = parseMs(b);
  if (ma == null || mb == null) return false;
  return Math.abs(ma - mb) <= windowMs;
}

function looksLikeChatSource(sourceType: string | null | undefined): boolean {
  return /chat|conversation|import/i.test(sourceType ?? '');
}

/**
 * True when journal.date is storage/write time pretending to be occurrence.
 * Same-calendar-day date-only values (midnight vs afternoon write) are NOT
 * treated as masquerade — that is honest date precision.
 */
export function isRecordingMasquerade(input: JournalMemoryTemporalInput): boolean {
  const stated = asSource(input.temporalSource);
  if (stated && STATED_SOURCES.has(stated)) return false;
  if (stated === 'recording_fallback' && isNearInstant(input.journalDate, input.recordedAt)) {
    return true;
  }
  if (!input.journalDate) return true;
  if (isNearInstant(input.journalDate, input.recordedAt) && looksLikeChatSource(input.sourceType)) {
    return true;
  }
  if (stated === 'recording_fallback' && calendarDay(input.journalDate) === calendarDay(input.recordedAt)) {
    return isNearInstant(input.journalDate, input.recordedAt);
  }
  return false;
}

function inferMentionedAt(input: JournalMemoryTemporalInput): string | null {
  if (!input.recordedAt) return null;
  if (looksLikeChatSource(input.sourceType)) return input.recordedAt;
  return null;
}

function occurrenceStatusFor(
  occurredAt: string | null,
  precision: TemporalPrecision,
  source: TemporalSource,
): JournalOccurrenceStatus {
  if (!occurredAt || source === 'recording_fallback') return 'unresolved';
  if (RANGE_PRECISIONS.has(precision) || precision === 'unknown') return precision === 'unknown' ? 'unresolved' : 'range';
  return 'confirmed';
}

/**
 * Resolve the three clocks for a journal memory. Canonical event occurrence
 * always wins. Recording time never becomes occurredAt.
 */
export function resolveJournalMemoryTemporal(input: JournalMemoryTemporalInput): JournalMemoryClocks {
  const journalEntryId = input.journalEntryId ?? null;
  const recordedAt = input.recordedAt ?? null;
  const mentionedAt = inferMentionedAt(input);
  const canonicalEventId = input.canonicalEventId ?? null;

  if (input.canonicalOccurredAt) {
    const precision = asPrecision(input.canonicalPrecision ?? input.precision);
    const source: TemporalSource = 'user_stated';
    const occurrenceStatus = occurrenceStatusFor(input.canonicalOccurredAt, precision, source);
    const temporal = canonicalTemporalFromLegacy({
      id: canonicalEventId ?? journalEntryId,
      occurredAt: input.canonicalOccurredAt,
      mentionedAt,
      recordedAt,
      precision,
      source,
      status: occurrenceStatus === 'confirmed' ? 'anchored' : occurrenceStatus === 'range' ? 'approximate' : 'unanchored',
      sourceLabel: 'resolved_event',
    });
    return {
      occurredAt: input.canonicalOccurredAt,
      mentionedAt,
      recordedAt,
      temporalSource: source,
      occurrenceStatus,
      precision,
      canonicalEventId,
      journalEntryId,
      temporal,
    };
  }

  const masquerade = isRecordingMasquerade(input);
  const stated = asSource(input.temporalSource);
  const source: TemporalSource = masquerade
    ? 'recording_fallback'
    : stated ?? (looksLikeChatSource(input.sourceType) ? 'context_inferred' : 'user_stated');
  const occurredAt = masquerade ? null : (input.journalDate ?? null);
  const precision = masquerade ? 'unknown' : asPrecision(input.precision);
  const occurrenceStatus = occurrenceStatusFor(occurredAt, precision, source);
  const temporal = canonicalTemporalFromLegacy({
    id: journalEntryId,
    occurredAt,
    mentionedAt,
    recordedAt,
    precision,
    source,
    status: occurrenceStatus === 'confirmed' ? 'anchored' : occurrenceStatus === 'range' ? 'approximate' : 'unanchored',
    sourceLabel: input.sourceType ?? 'journal_entry',
  });

  return {
    occurredAt,
    mentionedAt,
    recordedAt,
    temporalSource: source,
    occurrenceStatus,
    precision,
    canonicalEventId,
    journalEntryId,
    temporal,
  };
}

/** Compatibility `date` field: occurrence only. Empty when unresolved. */
export function occurrenceDateOrEmpty(clocks: JournalMemoryClocks): string {
  return clocks.occurredAt ?? '';
}

export function compareByOccurrence(a: JournalMemoryClocks, b: JournalMemoryClocks): number {
  const aOcc = parseMs(a.occurredAt);
  const bOcc = parseMs(b.occurredAt);
  if (aOcc != null && bOcc != null) return aOcc - bOcc;
  if (aOcc != null) return -1;
  if (bOcc != null) return 1;
  return 0;
}

/** Occurrence only. Recording/created_at is never a fallback. */
export function journalOccurredAt(entry: {
  date?: string | null;
  created_at?: string | null;
  timestamp?: string | null;
  metadata?: Record<string, unknown> | null;
  source?: string | null;
}): string | null {
  const meta = entry.metadata ?? {};
  const clocks = resolveJournalMemoryTemporal({
    journalDate: entry.date ?? null,
    recordedAt: entry.created_at ?? null,
    sourceType: entry.source ?? null,
    temporalSource: typeof meta.temporal_source === 'string' ? meta.temporal_source : null,
    precision: typeof meta.time_precision === 'string' ? meta.time_precision : null,
    canonicalOccurredAt: typeof meta.canonicalOccurredAt === 'string' ? meta.canonicalOccurredAt : null,
    canonicalEventId: typeof meta.canonicalEventId === 'string' ? meta.canonicalEventId : null,
  });
  return clocks.occurredAt;
}

/** Mention or recording provenance — never use as life occurrence. */
export function journalRecordedAt(entry: {
  created_at?: string | null;
  date?: string | null;
}): string | null {
  return entry.created_at ?? null;
}
