/**
 * Detect mismatches between stored occurrence dates and textual date claims.
 */

export type TemporalContradictionType =
  | 'YEAR_MISMATCH'
  | 'MONTH_MISMATCH'
  | 'DAY_MISMATCH'
  | 'JANUARY_FIRST_FALLBACK'
  | 'MENTION_OCCURRENCE_CONFLATION'
  | 'FALLBACK_DATE_USED'
  | 'UNKNOWN';

export type TemporalContradiction = {
  recordId: string;
  storedOccurrence?: string | null;
  textualDateClaims: string[];
  contradictionType: TemporalContradictionType;
  severity: number;
  recommendedAction: 'AUTO_REPAIR' | 'USE_DATE_RANGE' | 'REMOVE_OCCURRENCE_DATE' | 'NEEDS_REVIEW';
  suggestedYear?: number;
  suggestedMonth?: number; // 1-12
  suggestedDay?: number;
};

const MONTHS: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sept: 9, sep: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

const YEAR_RE = /\b((?:19|20)\d{2})\b/g;
const MONTH_YEAR_RE =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s*((?:19|20)\d{2})\b/gi;
const MONTH_ONLY_RE =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi;
const LAST_WEEK_RE = /\b(?:last week|the week before|around the week)\b/i;

function isoParts(iso: string | null | undefined): { y?: number; m?: number; d?: number } {
  if (!iso) return {};
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return {};
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function isJanuaryFirst(iso: string | null | undefined): boolean {
  const p = isoParts(iso);
  return p.m === 1 && p.d === 1;
}

export function extractTextualDateClaims(text: string): {
  years: number[];
  months: number[];
  dayHints: Array<{ month: number; day: number; year: number }>;
  mentionsLastWeek: boolean;
} {
  const years = new Set<number>();
  const months = new Set<number>();
  const dayHints: Array<{ month: number; day: number; year: number }> = [];

  for (const match of text.matchAll(YEAR_RE)) {
    years.add(Number(match[1]));
  }
  for (const match of text.matchAll(MONTH_YEAR_RE)) {
    const month = MONTHS[match[1].toLowerCase()];
    const day = Number(match[2]);
    const year = Number(match[3]);
    if (month) {
      months.add(month);
      dayHints.push({ month, day, year });
      years.add(year);
    }
  }
  for (const match of text.matchAll(MONTH_ONLY_RE)) {
    const month = MONTHS[match[1].toLowerCase()];
    if (month) months.add(month);
  }

  return {
    years: [...years],
    months: [...months],
    dayHints,
    mentionsLastWeek: LAST_WEEK_RE.test(text),
  };
}

export function detectTemporalContradiction(input: {
  recordId: string;
  storedOccurrence?: string | null;
  title?: string | null;
  summary?: string | null;
  temporalSource?: string | null;
  tags?: string[] | null;
}): TemporalContradiction | null {
  const text = [input.title, input.summary].filter(Boolean).join('\n');
  const claims = extractTextualDateClaims(text);
  const stored = isoParts(input.storedOccurrence);
  const claimsList: string[] = [];
  if (claims.years.length) claimsList.push(`years=${claims.years.join(',')}`);
  if (claims.months.length) claimsList.push(`months=${claims.months.join(',')}`);
  if (claims.dayHints.length) {
    claimsList.push(
      `dates=${claims.dayHints.map((h) => `${h.year}-${h.month}-${h.day}`).join(',')}`,
    );
  }

  const isFallbackSource =
    input.temporalSource === 'recording_fallback' ||
    (input.tags ?? []).some((t) => /recovered|import/i.test(t));

  // Jan 1 + body mentions a different month/day in same or other year
  if (isJanuaryFirst(input.storedOccurrence) && (claims.months.length > 0 || claims.dayHints.length > 0)) {
    const hint = claims.dayHints[0];
    const month = hint?.month ?? claims.months[0];
    if (month && month !== 1) {
      return {
        recordId: input.recordId,
        storedOccurrence: input.storedOccurrence,
        textualDateClaims: claimsList,
        contradictionType: 'JANUARY_FIRST_FALLBACK',
        severity: 0.95,
        recommendedAction: hint ? 'AUTO_REPAIR' : 'USE_DATE_RANGE',
        suggestedYear: hint?.year ?? claims.years[0] ?? stored.y,
        suggestedMonth: month,
        suggestedDay: hint?.day,
      };
    }
  }

  if (stored.y && claims.years.length > 0 && !claims.years.includes(stored.y)) {
    return {
      recordId: input.recordId,
      storedOccurrence: input.storedOccurrence,
      textualDateClaims: claimsList,
      contradictionType: 'YEAR_MISMATCH',
      severity: 0.9,
      recommendedAction: 'AUTO_REPAIR',
      suggestedYear: claims.years.sort((a, b) => b - a)[0],
      suggestedMonth: claims.dayHints[0]?.month ?? claims.months[0],
      suggestedDay: claims.dayHints[0]?.day,
    };
  }

  if (stored.m && claims.months.length > 0 && !claims.months.includes(stored.m)) {
    return {
      recordId: input.recordId,
      storedOccurrence: input.storedOccurrence,
      textualDateClaims: claimsList,
      contradictionType: 'MONTH_MISMATCH',
      severity: 0.85,
      recommendedAction: claims.dayHints[0] ? 'AUTO_REPAIR' : 'USE_DATE_RANGE',
      suggestedYear: claims.dayHints[0]?.year ?? claims.years[0] ?? stored.y,
      suggestedMonth: claims.dayHints[0]?.month ?? claims.months[0],
      suggestedDay: claims.dayHints[0]?.day,
    };
  }

  if (claims.mentionsLastWeek && stored.d && input.storedOccurrence) {
    return {
      recordId: input.recordId,
      storedOccurrence: input.storedOccurrence,
      textualDateClaims: [...claimsList, 'last_week'],
      contradictionType: 'MENTION_OCCURRENCE_CONFLATION',
      severity: 0.7,
      recommendedAction: 'USE_DATE_RANGE',
    };
  }

  if (isFallbackSource && input.storedOccurrence) {
    return {
      recordId: input.recordId,
      storedOccurrence: input.storedOccurrence,
      textualDateClaims: claimsList,
      contradictionType: 'FALLBACK_DATE_USED',
      severity: 0.75,
      recommendedAction: 'REMOVE_OCCURRENCE_DATE',
    };
  }

  return null;
}

/** Build a suggested ISO date from contradiction hints (day optional → month start). */
export function suggestedOccurrenceIso(c: TemporalContradiction): string | null {
  if (!c.suggestedYear || !c.suggestedMonth) return null;
  const day = c.suggestedDay ?? 1;
  const mm = String(c.suggestedMonth).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${c.suggestedYear}-${mm}-${dd}T12:00:00.000Z`;
}
