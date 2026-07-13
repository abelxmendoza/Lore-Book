/**
 * Canonical temporal evidence model — the one precedence policy for event time.
 *
 * Recording time must never masquerade as event time. Every event-time value
 * carries the PRECISION of its evidence, its SOURCE class, and a STATUS; a
 * lower evidence class can never overwrite a higher one, regardless of
 * confidence ("a high-confidence inference must not beat a stated date").
 *
 * Pure module: no DB, no clock reads — callers supply reference times.
 */

export type TemporalPrecision =
  | 'exact'
  | 'time_of_day'
  | 'date'
  | 'month'
  | 'season'
  | 'year'
  | 'unknown';

export type TemporalSource =
  | 'user_corrected'
  | 'user_stated'
  | 'document_stated'
  | 'relative_expression'
  | 'context_inferred'
  | 'recording_fallback';

export type TemporalStatus =
  | 'anchored'
  | 'approximate'
  | 'ambiguous'
  | 'unanchored'
  | 'corrected';

export interface TemporalEvidence {
  start: string | null;
  end: string | null;
  timezone: string | null;
  precision: TemporalPrecision;
  source: TemporalSource;
  status: TemporalStatus;
  confidence: number;
  /** The original wording that produced this value ("Saturday July 4th 2026"). */
  expression: string | null;
}

export function unanchoredEvidence(): TemporalEvidence {
  return {
    start: null,
    end: null,
    timezone: null,
    precision: 'unknown',
    source: 'recording_fallback',
    status: 'unanchored',
    confidence: 0,
    expression: null,
  };
}

const FULL_PRECISIONS: ReadonlySet<TemporalPrecision> = new Set(['exact', 'time_of_day', 'date']);

/**
 * Evidence class rank. Precedence:
 *   user correction > explicit full date/time > explicit partial date
 *   > relative expression > contextual inference > era/arc placement > unknown.
 * Confidence NEVER crosses classes — it only breaks ties within one.
 */
export function evidenceClassRank(e: Pick<TemporalEvidence, 'source' | 'precision' | 'start'>): number {
  if (!e.start) return 0;
  switch (e.source) {
    case 'user_corrected':
      return 70;
    case 'user_stated':
    case 'document_stated':
      return FULL_PRECISIONS.has(e.precision) ? 60 : 50;
    case 'relative_expression':
      return 40;
    case 'context_inferred':
      return 30;
    case 'recording_fallback':
    default:
      return 0;
  }
}

/** Pick between existing and candidate evidence. Class wins; ties → confidence. */
export function chooseTemporal(
  existing: TemporalEvidence | null | undefined,
  candidate: TemporalEvidence | null | undefined,
): TemporalEvidence {
  const a = existing ?? unanchoredEvidence();
  const b = candidate ?? unanchoredEvidence();
  const ra = evidenceClassRank(a);
  const rb = evidenceClassRank(b);
  if (rb > ra) return b;
  if (rb < ra) return a;
  return b.confidence > a.confidence ? b : a;
}

/** Status from the evidence itself. */
export function statusFor(e: Omit<TemporalEvidence, 'status'>): TemporalStatus {
  if (!e.start) return 'unanchored';
  if (e.source === 'user_corrected') return 'corrected';
  if (
    (e.source === 'user_stated' || e.source === 'document_stated') &&
    FULL_PRECISIONS.has(e.precision)
  ) {
    return 'anchored';
  }
  if (e.confidence < 0.4) return 'ambiguous';
  return 'approximate';
}

const MONTH_RE =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\b/i;
const YEAR_RE = /\b(19|20)\d{2}\b/;
const DAY_NUM_RE = /\b([1-9]|[12]\d|3[01])(st|nd|rd|th)?\b/;
const NUMERIC_DATE_RE = /\b\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\b/;
const TIME_RE = /\b\d{1,2}(:\d{2})?\s*(am|pm)\b|\b\d{1,2}:\d{2}\b/i;
const RELATIVE_RE =
  /\b(yesterday|today|tonight|last night|this morning|last week|last month|last year|last (mon|tues|wednes|thurs|fri|satur|sun)day|(a few|[0-9]+) (days?|weeks?|months?|years?) ago|the other (day|night)|this weekend|last weekend|recently)\b/i;
const SEASON_RE = /\b(spring|summer|fall|autumn|winter)\b/i;

export type ExpressionClass = {
  source: Extract<TemporalSource, 'user_stated' | 'relative_expression' | 'context_inferred'>;
  precision: TemporalPrecision;
};

/**
 * Classify the wording that produced a temporal value. An explicitly stated
 * calendar date is a different evidence CLASS than "last night" even when a
 * resolver reports similar confidence for both.
 */
export function classifyTemporalExpression(expression: string | null | undefined): ExpressionClass {
  const text = (expression ?? '').trim();
  if (!text) return { source: 'context_inferred', precision: 'unknown' };

  const hasMonth = MONTH_RE.test(text);
  const hasYear = YEAR_RE.test(text);
  const hasDayNum = DAY_NUM_RE.test(text.replace(YEAR_RE, ''));
  const hasTime = TIME_RE.test(text);

  if (NUMERIC_DATE_RE.test(text) || (hasMonth && hasDayNum)) {
    return { source: 'user_stated', precision: hasTime ? 'exact' : 'date' };
  }
  if (hasMonth && hasYear) return { source: 'user_stated', precision: 'month' };
  if (SEASON_RE.test(text) && hasYear) return { source: 'user_stated', precision: 'season' };
  if (RELATIVE_RE.test(text)) {
    return {
      source: 'relative_expression',
      precision: /night|tonight|morning|evening|afternoon/i.test(text) ? 'time_of_day' : 'date',
    };
  }
  if (hasMonth) return { source: 'user_stated', precision: 'month' };
  if (hasYear) return { source: 'user_stated', precision: 'year' };
  return { source: 'context_inferred', precision: 'date' };
}
