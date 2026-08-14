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

  if (expr.kind === 'calendar_range') {
    const years = [...expr.phrase.matchAll(/(?:19|20)\d{2}/g)].map((match) => Number(match[0]));
    const startYear = years[0];
    const endYear = years[1] ?? years[0];
    if (startYear && endYear) {
      return {
        precision: expr.precision,
        startDate: `${startYear}-01-01T00:00:00.000Z`,
        endDate: `${endYear}-12-31T23:59:59.999Z`,
        startHint: String(startYear),
        endHint: String(endYear),
        relativeLabel: expr.phrase,
      };
    }
  }

  if (expr.kind === 'age_range') {
    const ages = [...expr.phrase.matchAll(/\d{1,2}/g)].map((match) => match[0]);
    return {
      precision: 'relative',
      startHint: ages[0] ? `age ${ages[0]}` : undefined,
      endHint: ages[1] ? `age ${ages[1]}` : undefined,
      relativeLabel: expr.phrase,
    };
  }

  if (expr.kind === 'fuzzy') {
    const year = expr.phrase.match(/(?:19|20)\d{2}/)?.[0];
    return {
      precision: 'approximate',
      startDate: year ? `${year}-01-01T00:00:00.000Z` : undefined,
      endDate: year ? `${year}-12-31T23:59:59.999Z` : undefined,
      startHint: year,
      endHint: year,
      relativeLabel: expr.phrase,
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
