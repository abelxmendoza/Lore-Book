/**
 * Write-time occurrence contract for journal_entries.
 *
 * journal_entries.date means occurrence only. It may be null (unknown).
 * created_at / recordedAt is when LoreBook saved the row.
 * mentionedAt is when the user wrote/spoke about it.
 *
 * No temporal evidence ≠ now.
 */

import {
  resolveChronoInText,
  resolveTemporalWindow,
} from '../../utils/temporalResolver';
import { resolveTemporalAnchor } from '../../utils/temporalAnchorResolver';
import type { TemporalPrecision, TemporalSource } from './temporalEvidence';

export type JournalDbTimePrecision = 'exact' | 'day' | 'month' | 'year' | 'approximate';

export type JournalWriteOccurrence = {
  occurredAt: string | null;
  occurredEnd: string | null;
  mentionedAt: string | null;
  recordedAt: string;
  precision: TemporalPrecision;
  dbPrecision: JournalDbTimePrecision;
  confidence: number;
  temporalSource: TemporalSource;
  expression: string | null;
  unresolvedReason: string | null;
};

const UNKNOWN_WHEN_RE =
  /\b(i don'?t (remember|know) when|i can'?t remember when|no idea when|not sure when|i have no idea when)\b/i;
const WRITE_SPEECH_RE =
  /\b(wrote (this|about)|writing this|telling you|i(?:'m| am) (writing|journaling)|mention(?:ed|ing) this)\b/i;
const RIGHT_NOW_RE = /\b(right now|just now)\b/i;
const WRITE_TODAY_LABELS = new Set(['today', 'this morning', 'right now', 'just now']);

function toDbPrecision(precision: TemporalPrecision): JournalDbTimePrecision {
  switch (precision) {
    case 'exact':
    case 'time_of_day':
      return 'exact';
    case 'date':
      return 'day';
    case 'month':
      return 'month';
    case 'year':
      return 'year';
    default:
      return 'approximate';
  }
}

function collectSentenceWindows(text: string, now: Date) {
  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const windows: Array<{ sentence: string; label: string; start: Date; end: Date; precision: string; confidence: number }> = [];
  for (const sentence of sentences) {
    const window =
      resolveTemporalAnchor(sentence, now)
      ?? resolveChronoInText(sentence, now)
      ?? resolveTemporalWindow(sentence, now);
    if (!window) continue;
    windows.push({
      sentence,
      label: window.label,
      start: window.start,
      end: window.end,
      precision: window.precision,
      confidence: window.confidence,
    });
  }
  if (RIGHT_NOW_RE.test(text) && !windows.some((w) => WRITE_TODAY_LABELS.has(w.label))) {
    windows.push({
      sentence: text,
      label: 'right now',
      start: now,
      end: now,
      precision: 'time_of_day',
      confidence: 0.95,
    });
  }
  return windows;
}

function isWriteTimeWindow(window: { sentence: string; label: string }): boolean {
  if (WRITE_SPEECH_RE.test(window.sentence)) return WRITE_TODAY_LABELS.has(window.label);
  return false;
}

/**
 * Classify occurrence from journal/chat text. Callers inject `now` for tests.
 */
export function classifyJournalOccurrenceFromText(
  content: string,
  now: Date = new Date(),
): JournalWriteOccurrence {
  const recordedAt = now.toISOString();
  const mentionedAt = recordedAt;
  const trimmed = content.trim();

  if (!trimmed) {
    return unresolvedWrite(recordedAt, mentionedAt, 'empty content');
  }
  if (UNKNOWN_WHEN_RE.test(trimmed)) {
    return unresolvedWrite(recordedAt, mentionedAt, 'user said occurrence is unknown');
  }

  const windows = collectSentenceWindows(trimmed, now);
  const occurrenceWindows = windows.filter((window) => !isWriteTimeWindow(window));
  const ranked = occurrenceWindows
    .filter((window) => !WRITE_TODAY_LABELS.has(window.label) || occurrenceWindows.length === 1)
    .sort((a, b) => {
      const aWriteLike = WRITE_TODAY_LABELS.has(a.label) ? 1 : 0;
      const bWriteLike = WRITE_TODAY_LABELS.has(b.label) ? 1 : 0;
      return aWriteLike - bWriteLike || b.confidence - a.confidence;
    });

  const chosen = ranked[0];
  if (!chosen) {
    return unresolvedWrite(recordedAt, mentionedAt, 'no temporal evidence');
  }

  const precision = mapWindowPrecision(chosen.precision);
  const source: TemporalSource = WRITE_TODAY_LABELS.has(chosen.label)
    ? 'user_stated'
    : chosen.confidence >= 0.85
      ? 'user_stated'
      : 'relative_expression';

  return {
    occurredAt: chosen.start.toISOString(),
    occurredEnd: chosen.end && chosen.end.getTime() !== chosen.start.getTime()
      ? chosen.end.toISOString()
      : null,
    mentionedAt,
    recordedAt,
    precision,
    dbPrecision: toDbPrecision(precision),
    confidence: chosen.confidence,
    temporalSource: source,
    expression: chosen.label,
    unresolvedReason: null,
  };
}

function mapWindowPrecision(precision: string): TemporalPrecision {
  switch (precision) {
    case 'hour':
      return 'time_of_day';
    case 'day':
      return 'date';
    case 'week':
      return 'week';
    case 'month':
      return 'month';
    case 'season':
      return 'season';
    case 'year':
      return 'year';
    default:
      return 'approximate';
  }
}

function unresolvedWrite(recordedAt: string, mentionedAt: string, reason: string): JournalWriteOccurrence {
  return {
    occurredAt: null,
    occurredEnd: null,
    mentionedAt,
    recordedAt,
    precision: 'unknown',
    dbPrecision: 'approximate',
    confidence: 0,
    temporalSource: 'recording_fallback',
    expression: null,
    unresolvedReason: reason,
  };
}

function callerTemporalSource(
  input: { temporalSource?: TemporalSource | null; metadata?: Record<string, unknown> | null },
): TemporalSource | null {
  if (input.temporalSource) return input.temporalSource;
  const raw = input.metadata?.temporal_source;
  if (typeof raw === 'string' && raw.trim()) return raw as TemporalSource;
  return null;
}

function mentionClock(input: {
  mentionedAt?: string | null;
  sourceCreatedAt?: string | null;
  recordedAt: string;
}): string {
  if (input.mentionedAt && Number.isFinite(Date.parse(input.mentionedAt))) {
    return new Date(input.mentionedAt).toISOString();
  }
  if (input.sourceCreatedAt && Number.isFinite(Date.parse(input.sourceCreatedAt))) {
    return new Date(input.sourceCreatedAt).toISOString();
  }
  return input.recordedAt;
}

function parseOptionalIso(value?: string | null): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function resolveJournalWriteOccurrence(input: {
  explicitDate?: string | null;
  occurredEnd?: string | null;
  content?: string | null;
  sourceType?: string | null;
  metadata?: Record<string, unknown> | null;
  temporalSource?: TemporalSource | null;
  mentionedAt?: string | null;
  sourceCreatedAt?: string | null;
  occurrencePrecision?: TemporalPrecision | null;
  now?: Date;
}): JournalWriteOccurrence {
  const now = input.now ?? new Date();
  const recordedAt = now.toISOString();
  const mentionedAt = mentionClock({
    mentionedAt: input.mentionedAt,
    sourceCreatedAt: input.sourceCreatedAt,
    recordedAt,
  });
  const source = callerTemporalSource(input);

  if (source === 'recording_fallback') {
    return unresolvedWrite(recordedAt, mentionedAt, 'caller marked recording_fallback');
  }

  const explicitDate = typeof input.explicitDate === 'string' ? input.explicitDate.trim() : '';
  if (explicitDate) {
    const parsed = Date.parse(explicitDate);
    if (Number.isFinite(parsed)) {
      const precision = input.occurrencePrecision ?? 'date';
      return {
        occurredAt: new Date(parsed).toISOString(),
        occurredEnd: parseOptionalIso(input.occurredEnd),
        mentionedAt,
        recordedAt,
        precision,
        dbPrecision: toDbPrecision(precision),
        confidence: 0.95,
        temporalSource: source ?? 'user_stated',
        expression: explicitDate,
        unresolvedReason: null,
      };
    }
  }

  const classified = classifyJournalOccurrenceFromText(input.content ?? '', now);
  return {
    ...classified,
    mentionedAt,
    recordedAt,
  };
}

export function journalWriteMetadata(
  existing: Record<string, unknown>,
  write: JournalWriteOccurrence,
): Record<string, unknown> {
  return {
    ...existing,
    temporal_source: write.temporalSource,
    time_precision: write.precision,
    time_confidence: write.confidence,
    occurredAt: write.occurredAt,
    mentionedAt: write.mentionedAt,
    recordedAt: write.recordedAt,
    occurrenceStatus: write.occurredAt ? (write.precision === 'unknown' ? 'unresolved' : 'confirmed') : 'unresolved',
    unresolvedReason: write.unresolvedReason,
  };
}

export function isNotNullViolation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '23502' || /null value .*violates not-null constraint/i.test(error.message ?? '');
}
