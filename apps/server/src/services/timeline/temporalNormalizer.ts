import type { NormalizedTime, TemporalExpression } from './timelineStitchingTypes';
import { extractGroupedTimeWindow } from './temporalExpressionExtractor';

/** Never invent exact ISO dates from fuzzy phrases. */
export function normalizeTemporalExpression(
  expr: TemporalExpression,
  text: string,
  messageTimestamp?: string,
): NormalizedTime {
  const grouped = extractGroupedTimeWindow(text);
  const phrase = expr.phrase.toLowerCase();

  if (grouped) {
    return {
      precision: 'relative',
      relativeLabel: grouped.relativeDate,
      schoolDayContext: grouped.schoolDayContext,
      timeOfDay: grouped.timeOfDay,
    };
  }

  if (expr.kind === 'era') {
    return {
      precision: 'era',
      eraLabel: expr.phrase,
    };
  }

  if (expr.kind === 'recurring') {
    const dayMatch = phrase.match(/every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
    return {
      precision: 'recurring',
      relativeLabel: expr.phrase,
      startHint: dayMatch?.[1],
    };
  }

  if (expr.kind === 'duration') {
    const sinceMatch = text.match(/\bsince\s+([A-Za-z]+)(?:\s+for\s+(\d+\s+months?))?\b/i);
    const monthMatch = text.match(
      /\b(?:in|since|started(?:\s+\w+)?\s+in)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
    );
    return {
      precision: 'month',
      startHint: sinceMatch?.[1] ?? monthMatch?.[1],
      durationHint: sinceMatch?.[2] ?? text.match(/\bfor\s+(\d+\s+months?)\b/i)?.[1],
      relativeLabel: expr.phrase,
    };
  }

  if (phrase.includes('last summer')) {
    return { precision: 'season', relativeLabel: 'last summer' };
  }

  if (phrase.includes('before covid')) {
    return { precision: 'fuzzy', relativeLabel: 'before covid', eraLabel: 'pre-pandemic' };
  }

  if (phrase.includes('those years')) {
    return { precision: 'fuzzy', eraLabel: 'those years' };
  }

  if (phrase.includes('middle school')) {
    return { precision: 'era', eraLabel: 'middle school' };
  }

  if (phrase.includes('yesterday') || phrase.includes('last night')) {
    return {
      precision: 'day',
      relativeLabel: expr.phrase,
      date: undefined,
    };
  }

  if (messageTimestamp && expr.precision === 'exact') {
    return { precision: 'exact', date: messageTimestamp };
  }

  return {
    precision: expr.precision,
    relativeLabel: expr.phrase,
  };
}

export function preservesFuzzyPrecision(normalized: NormalizedTime): boolean {
  if (normalized.precision === 'fuzzy' || normalized.precision === 'era' || normalized.precision === 'season') {
    return !normalized.date && !normalized.startDate && !normalized.endDate;
  }
  return true;
}
