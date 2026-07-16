/**
 * Temporal query classification + window resolution for chat retrieval.
 * Distinguishes when something happened from when it was written down.
 */
import {
  resolveAllTemporalAnchors,
  windowToISORange,
  type TemporalWindow,
} from '../../utils/temporalAnchorResolver';

export type TemporalQueryIntent =
  | 'TODAY_QUERY'
  | 'YESTERDAY_QUERY'
  | 'THIS_WEEK_QUERY'
  | 'THIS_MONTH_QUERY'
  | 'TIME_RANGE_QUERY'
  | 'TEMPORAL_COMPARISON_QUERY'
  | 'TIMELINE_QUERY';

export type TemporalPrecision = 'EXACT' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'APPROXIMATE' | 'UNKNOWN';
export type TemporalSource = 'USER_EXPLICIT' | 'USER_APPROXIMATE' | 'EXTRACTED' | 'INFERRED' | 'SYSTEM';

export type ResolvedTemporalQuery = {
  intent: TemporalQueryIntent | null;
  window: TemporalWindow | null;
  originalPhrase?: string;
  isoRange?: { gte: string; lte: string };
};

const TEMPORAL_INTENT_RULES: Array<{ intent: TemporalQueryIntent; pattern: RegExp }> = [
  { intent: 'TODAY_QUERY', pattern: /\b(what did i do today|what happened today|what(?:'s| is) going on today|today(?:'s)? (?:events?|memories|activities))\b/i },
  { intent: 'YESTERDAY_QUERY', pattern: /\b(what did i do yesterday|what happened yesterday|yesterday(?:'s)? (?:events?|memories|activities))\b/i },
  { intent: 'THIS_WEEK_QUERY', pattern: /\b(what did i do this week|what happened this week|this week(?:'s)? (?:events?|memories|activities)|what have i done this week)\b/i },
  { intent: 'THIS_MONTH_QUERY', pattern: /\b(what did i do this month|what happened this month|this month(?:'s)? (?:events?|memories|activities))\b/i },
  { intent: 'TEMPORAL_COMPARISON_QUERY', pattern: /\b(what happened before|what happened after|before i (?:met|started|joined)|after i (?:met|started|joined|left))\b/i },
  { intent: 'TIMELINE_QUERY', pattern: /\b(what was i doing in|what happened in|during (?:january|february|march|april|may|june|july|august|september|october|november|december|\d{4})|in (?:january|february|march|april|may|june|july|august|september|october|november|december|\d{4}))\b/i },
];

export function classifyTemporalQuery(question: string, now = new Date()): ResolvedTemporalQuery {
  const trimmed = question.trim();
  for (const rule of TEMPORAL_INTENT_RULES) {
    if (rule.pattern.test(trimmed)) {
      const window = resolveAllTemporalAnchors(trimmed, now);
      return {
        intent: rule.intent,
        window,
        isoRange: window ? windowToISORange(window) : undefined,
      };
    }
  }

  // Bare anchors like "today" inside declarative journal text (e.g. "…with Grok today")
  // must not force TIME_RANGE_QUERY — that path is for temporal *questions/recalls*.
  const looksLikeTemporalQuery =
    /[?]|(?:^|\b)(?:what|when|where|who|how|which|show me|tell me|list|did i|have i|was i|were there|what happened)\b/i.test(
      trimmed,
    );

  const window = resolveAllTemporalAnchors(trimmed, now);
  if (window && window.confidence >= 0.6 && looksLikeTemporalQuery) {
    return {
      intent: 'TIME_RANGE_QUERY',
      window,
      originalPhrase: window.label,
      isoRange: windowToISORange(window),
    };
  }

  return { intent: null, window: null };
}

/** True when the record's occurrence timestamp falls inside the query window. */
export function occurredInWindow(
  occurredAt: string | null | undefined,
  window: TemporalWindow | null
): boolean {
  if (!window || !occurredAt) return !window;
  const t = new Date(occurredAt).getTime();
  if (!Number.isFinite(t)) return false;
  return t >= window.start.getTime() && t <= window.end.getTime();
}

/** Prefer event occurrence fields; never use created_at for temporal filtering. */
export function pickOccurrenceTime(row: {
  date?: string | null;
  start_time?: string | null;
  event_date?: string | null;
  occurred_at?: string | null;
}): string | null {
  return row.date ?? row.start_time ?? row.event_date ?? row.occurred_at ?? null;
}
