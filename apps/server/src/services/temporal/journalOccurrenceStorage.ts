/**
 * Journal occurrence write contract.
 *
 * date        = OCCURRED (nullable)
 * created_at  = RECORDED
 * metadata    = precision / source / evidence
 *
 * Recording time is never written into date merely because occurrence is unknown.
 */

import type { DateSuggestion } from '../dateAssignmentService';

export const JOURNAL_OCCURRENCE_NULL_PRECISION = 'unknown';

export type JournalOccurrenceWrite = {
  /** journal_entries.date — occurrence only. */
  date: string | null;
  /** Mirrors date. */
  timestamp: string | null;
  time_precision: 'exact' | 'day' | 'month' | 'year' | 'approximate' | 'unknown';
  time_confidence: number;
  temporal_source: string;
  temporal_precision: string;
  temporal_expression: string | null;
  recorded_at: string;
};

function mapPrecision(
  precision: DateSuggestion['precision'] | string | undefined,
): JournalOccurrenceWrite['time_precision'] {
  switch (precision) {
    case 'year':
      return 'year';
    case 'month':
    case 'season':
    case 'quarter':
      return 'month';
    case 'approximate':
      return 'approximate';
    case 'unknown':
      return 'unknown';
    case 'hour':
    case 'minute':
    case 'second':
    case 'exact':
      return 'exact';
    case 'day':
    default:
      return 'day';
  }
}

function temporalSourceFromSuggestion(suggestion: DateSuggestion): string {
  if (suggestion.source === 'extracted') return 'user_stated';
  if (suggestion.source === 'inferred' || suggestion.source === 'context') return 'context_inferred';
  return 'unresolved';
}

/**
 * Decide the occurrence columns for a journal insert.
 * Callers must not manufacture an occurrence timestamp.
 */
export function resolveJournalOccurrenceWrite(input: {
  explicitDate?: string | null;
  suggestion?: DateSuggestion | null;
  recordedAt: string;
  metadata?: Record<string, unknown>;
}): JournalOccurrenceWrite {
  const metaSource =
    typeof input.metadata?.temporal_source === 'string' ? input.metadata.temporal_source : null;
  const metaExpression =
    typeof input.metadata?.temporal_expression === 'string'
      ? input.metadata.temporal_expression
      : null;
  const metaPrecision =
    typeof input.metadata?.temporal_precision === 'string'
      ? input.metadata.temporal_precision
      : null;

  if (input.explicitDate) {
    return {
      date: input.explicitDate,
      timestamp: input.explicitDate,
      time_precision: mapPrecision(metaPrecision ?? 'day'),
      time_confidence: 0.9,
      temporal_source: metaSource ?? 'user_stated',
      temporal_precision: metaPrecision ?? 'day',
      temporal_expression: metaExpression,
      recorded_at: input.recordedAt,
    };
  }

  const suggestion = input.suggestion;
  if (
    suggestion?.date &&
    suggestion.source !== 'default' &&
    suggestion.source !== 'unresolved' &&
    suggestion.confidence >= 0.5
  ) {
    const iso = suggestion.date.toISOString();
    const precision = mapPrecision(suggestion.precision);
    const source = temporalSourceFromSuggestion(suggestion);
    return {
      date: iso,
      timestamp: iso,
      time_precision: precision,
      time_confidence: suggestion.confidence,
      temporal_source: metaSource ?? source,
      temporal_precision: suggestion.precision,
      temporal_expression: suggestion.originalText ?? metaExpression,
      recorded_at: input.recordedAt,
    };
  }

  return {
    date: null,
    timestamp: null,
    time_precision: JOURNAL_OCCURRENCE_NULL_PRECISION,
    time_confidence: 0,
    temporal_source: 'unresolved',
    temporal_precision: 'unknown',
    temporal_expression: metaExpression,
    recorded_at: input.recordedAt,
  };
}

export type ChronologyIndexPlan =
  | { action: 'omit'; startTime: null; reason: string }
  | {
      action: 'upsert';
      startTime: string;
      endTime: string | null;
      timePrecision: string;
      yearBucket: number;
      monthBucket: string;
      decadeBucket: number;
    };

/**
 * Mirrors sync_chronology_index after the occurrence-nullable migration.
 * Unknown occurrence is omitted from dated chronology; never COALESCE(date, NOW()).
 */
export function planJournalChronologyIndexSync(input: {
  date?: string | null;
  endTime?: string | null;
  timePrecision?: string | null;
}): ChronologyIndexPlan {
  if (!input.date) {
    return {
      action: 'omit',
      startTime: null,
      reason: 'unknown occurrence must not mint chronology start_time',
    };
  }
  const start = new Date(input.date);
  if (!Number.isFinite(start.getTime())) {
    return {
      action: 'omit',
      startTime: null,
      reason: 'invalid occurrence timestamp',
    };
  }
  const year = start.getUTCFullYear();
  const monthBucket = `${year}-${String(start.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const precision =
    input.timePrecision && input.timePrecision !== 'unknown' ? input.timePrecision : 'day';
  return {
    action: 'upsert',
    startTime: input.date,
    endTime: input.endTime ?? null,
    timePrecision: precision,
    yearBucket: year,
    monthBucket,
    decadeBucket: Math.floor(year / 10) * 10,
  };
}

export function applyOccurrenceWriteToMetadata(
  metadata: Record<string, unknown>,
  write: JournalOccurrenceWrite,
): Record<string, unknown> {
  return {
    ...metadata,
    temporal_source: write.temporal_source,
    temporal_precision: write.temporal_precision,
    recorded_at: write.recorded_at,
    ...(write.temporal_expression ? { temporal_expression: write.temporal_expression } : {}),
  };
}
