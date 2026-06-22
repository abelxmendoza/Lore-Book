import type { TemporalExpression, TimePrecision } from './timelineStitchingTypes';
import { STANDALONE_TIME_PHRASES } from './timelineStitchingTypes';

const RELATIVE_RE =
  /\b(yesterday|last\s+night|today|tonight|last\s+summer|last\s+week|last\s+year|last\s+month|before\s+covid|a\s+(?:few|couple)\s+weeks?\s+ago)\b/gi;

const RECURRING_RE =
  /\b(every\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|weekly|all\s+the\s+time)\b/gi;

const ERA_RE =
  /\b(childhood|middle\s+school|high\s+school|college|csuf\s+era|vanguard\s+robotics\s+era|amazon\s+era|lorebook\s+build\s+era|pandemic\s+era|those\s+years)\b/gi;

const MONTH_RE =
  /\b(?:in|since|started(?:\s+\w+)?\s+in)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi;

const DURATION_RE =
  /\b(?:since\s+([A-Za-z]+)(?:\s+for\s+(\d+\s+months?))?|for\s+(\d+\s+months?))\b/gi;

const SCHOOL_DAY_RE = /\b(lunch\s+break|after\s+school)\b/gi;
const TIME_OF_DAY_RE = /\b(around\s+noon|at\s+noon|in\s+the\s+morning|at\s+night)\b/gi;

const GROUPED_WINDOW_RE =
  /\b(yesterday)\s+(?:at\s+)?(lunch\s+break)\b/gi;

export function isStandaloneTimePhrase(phrase: string): boolean {
  const key = phrase.trim().toLowerCase().replace(/\s+/g, ' ');
  return STANDALONE_TIME_PHRASES.has(key);
}

export function extractTemporalExpressions(text: string): TemporalExpression[] {
  const out: TemporalExpression[] = [];
  const seen = new Set<string>();

  const add = (expr: TemporalExpression) => {
    const key = expr.phrase.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(expr);
  };

  let match: RegExpExecArray | null;

  const groupedRe = new RegExp(GROUPED_WINDOW_RE.source, 'gi');
  while ((match = groupedRe.exec(text)) !== null) {
    add({
      phrase: `${match[1]} at ${match[2]}`,
      rawSpan: match[0],
      kind: 'school_day',
      precision: 'relative',
      isStandaloneOnly: true,
    });
  }

  const hasGroupedYesterdayLunch = /\byesterday\s+(?:at\s+)?lunch\s+break\b/i.test(text);

  const relativeRe = new RegExp(RELATIVE_RE.source, 'gi');
  while ((match = relativeRe.exec(text)) !== null) {
    const phrase = match[1].trim();
    if (hasGroupedYesterdayLunch && phrase.toLowerCase() === 'yesterday') continue;
    add({
      phrase,
      rawSpan: match[0],
      kind: 'relative',
      precision: precisionForRelative(phrase),
      isStandaloneOnly: true,
    });
  }

  const recurringRe = new RegExp(RECURRING_RE.source, 'gi');
  while ((match = recurringRe.exec(text)) !== null) {
    add({
      phrase: match[1].trim(),
      rawSpan: match[0],
      kind: 'recurring',
      precision: 'recurring',
      isStandaloneOnly: true,
    });
  }

  const eraRe = new RegExp(ERA_RE.source, 'gi');
  while ((match = eraRe.exec(text)) !== null) {
    add({
      phrase: match[1].trim(),
      rawSpan: match[0],
      kind: 'era',
      precision: 'era',
      isStandaloneOnly: false,
    });
  }

  const durationRe = new RegExp(DURATION_RE.source, 'gi');
  while ((match = durationRe.exec(text)) !== null) {
    const phrase = match[0].trim();
    add({
      phrase,
      rawSpan: match[0],
      kind: 'duration',
      precision: 'month',
      isStandaloneOnly: false,
    });
  }

  const monthRe = new RegExp(MONTH_RE.source, 'gi');
  while ((match = monthRe.exec(text)) !== null) {
    const month = match[1].trim();
    add({
      phrase: `in ${month}`,
      rawSpan: match[0],
      kind: 'duration',
      precision: 'month',
      isStandaloneOnly: false,
    });
  }

  const schoolRe = new RegExp(SCHOOL_DAY_RE.source, 'gi');
  while ((match = schoolRe.exec(text)) !== null) {
    if (/\byesterday\b/i.test(text) && match[1].toLowerCase() === 'lunch break') continue;
    add({
      phrase: match[1].trim(),
      rawSpan: match[0],
      kind: 'school_day',
      precision: 'day',
      isStandaloneOnly: true,
    });
  }

  const todRe = new RegExp(TIME_OF_DAY_RE.source, 'gi');
  while ((match = todRe.exec(text)) !== null) {
    add({
      phrase: match[1].trim(),
      rawSpan: match[0],
      kind: 'time_of_day',
      precision: 'day',
      isStandaloneOnly: true,
    });
  }

  return out;
}

function precisionForRelative(phrase: string): TimePrecision {
  const key = phrase.toLowerCase();
  if (key.includes('summer')) return 'season';
  if (key.includes('covid')) return 'fuzzy';
  if (key.includes('yesterday') || key.includes('night') || key.includes('today')) return 'day';
  if (key.includes('week')) return 'relative';
  if (key.includes('year') || key.includes('month')) return 'month';
  return 'relative';
}

export function extractGroupedTimeWindow(text: string): {
  relativeDate?: string;
  schoolDayContext?: string;
  timeOfDay?: string;
} | null {
  const lunchYesterday = text.match(/\b(yesterday)\s+(?:at\s+)?(lunch\s+break)\b/i);
  if (lunchYesterday) {
    return { relativeDate: lunchYesterday[1], schoolDayContext: lunchYesterday[2] };
  }
  const noonYesterday = text.match(/\b(around\s+noon)\s+(yesterday)\b/i);
  if (noonYesterday) {
    return { relativeDate: noonYesterday[2], timeOfDay: noonYesterday[1] };
  }
  return null;
}
