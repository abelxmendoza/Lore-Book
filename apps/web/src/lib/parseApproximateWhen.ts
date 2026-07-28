/**
 * Parse loose user "when" phrases into timeline anchors.
 * Prefer honest precision over inventing exact clock times.
 */

export type TemporalPrecision = 'date' | 'month' | 'season' | 'year' | 'unknown';
export type TemporalStatus = 'anchored' | 'approximate' | 'unanchored';

export type ApproximateWhen = {
  /** Original user phrase (trimmed), or null when blank. */
  whenText: string | null;
  /** ISO start hint when we can place a bucket; null when truly unknown. */
  startTime: string | null;
  temporalPrecision: TemporalPrecision;
  temporalStatus: TemporalStatus;
};

const MONTHS: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

const SEASON_MONTH: Record<string, number> = {
  spring: 3,
  summer: 6,
  fall: 9,
  autumn: 9,
  winter: 0,
};

function isoUtc(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month, day, 12, 0, 0)).toISOString();
}

function hasApproxCue(text: string): boolean {
  return /\b(around|about|approx(?:imately)?|sometime|roughly|ish|maybe|~)\b/i.test(text);
}

/**
 * Derive a short Life Log title from a freeform story when the user skipped title.
 */
export function titleFromStory(story: string): string {
  const cleaned = story.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Untitled moment';
  const firstChunk = cleaned.split(/(?<=[.!?])\s+/)[0]?.trim() || cleaned;
  if (firstChunk.length <= 72) return firstChunk;
  const clipped = firstChunk.slice(0, 69).replace(/\s+\S*$/, '').trimEnd();
  return `${clipped || firstChunk.slice(0, 69)}…`;
}

export function parseApproximateWhen(
  raw: string | null | undefined,
  now: Date = new Date(),
): ApproximateWhen {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return {
      whenText: null,
      startTime: null,
      temporalPrecision: 'unknown',
      temporalStatus: 'unanchored',
    };
  }

  const approx = hasApproxCue(text);
  const lower = text.toLowerCase();

  // Exact ISO date
  const isoDay = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDay) {
    const startTime = isoUtc(Number(isoDay[1]), Number(isoDay[2]) - 1, Number(isoDay[3]));
    return {
      whenText: text,
      startTime,
      temporalPrecision: 'date',
      temporalStatus: approx ? 'approximate' : 'anchored',
    };
  }

  // Year only: 2019
  if (/^\d{4}$/.test(text)) {
    const y = Number(text);
    return {
      whenText: text,
      startTime: isoUtc(y, 0, 1),
      temporalPrecision: 'year',
      temporalStatus: 'approximate',
    };
  }

  // Season + year: summer 2019 / fall of 2020
  const seasonYear = lower.match(
    /\b(spring|summer|fall|autumn|winter)\s+(?:of\s+)?(\d{4})\b/,
  );
  if (seasonYear) {
    const season = seasonYear[1];
    const y = Number(seasonYear[2]);
    return {
      whenText: text,
      startTime: isoUtc(y, SEASON_MONTH[season] ?? 0, 1),
      temporalPrecision: 'season',
      temporalStatus: 'approximate',
    };
  }

  // Month + year: June 2019 / Jun 2019 / 06/2019
  const monthYear = lower.match(
    /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\s+(\d{4})\b/,
  );
  if (monthYear) {
    const month = MONTHS[monthYear[1]];
    const y = Number(monthYear[2]);
    return {
      whenText: text,
      startTime: isoUtc(y, month, 1),
      temporalPrecision: 'month',
      temporalStatus: approx ? 'approximate' : 'approximate',
    };
  }

  const numericMonthYear = text.match(/\b(\d{1,2})[\/\-](\d{4})\b/);
  if (numericMonthYear) {
    const month = Math.max(1, Math.min(12, Number(numericMonthYear[1]))) - 1;
    const y = Number(numericMonthYear[2]);
    return {
      whenText: text,
      startTime: isoUtc(y, month, 1),
      temporalPrecision: 'month',
      temporalStatus: 'approximate',
    };
  }

  // Month + day + year: June 12, 2019 / June 12 2019
  const monthDayYear = lower.match(
    /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/,
  );
  if (monthDayYear) {
    const month = MONTHS[monthDayYear[1]];
    const day = Number(monthDayYear[2]);
    const y = Number(monthDayYear[3]);
    return {
      whenText: text,
      startTime: isoUtc(y, month, day),
      temporalPrecision: 'date',
      temporalStatus: approx ? 'approximate' : 'anchored',
    };
  }

  // Relative: yesterday / last week / last summer / last year / last month
  if (/\byesterday\b/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return {
      whenText: text,
      startTime: isoUtc(d.getFullYear(), d.getMonth(), d.getDate()),
      temporalPrecision: 'date',
      temporalStatus: 'approximate',
    };
  }
  if (/\blast\s+week\b/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return {
      whenText: text,
      startTime: isoUtc(d.getFullYear(), d.getMonth(), d.getDate()),
      temporalPrecision: 'date',
      temporalStatus: 'approximate',
    };
  }
  if (/\blast\s+month\b/.test(lower)) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    return {
      whenText: text,
      startTime: isoUtc(d.getFullYear(), d.getMonth(), 1),
      temporalPrecision: 'month',
      temporalStatus: 'approximate',
    };
  }
  if (/\blast\s+year\b/.test(lower)) {
    return {
      whenText: text,
      startTime: isoUtc(now.getFullYear() - 1, 0, 1),
      temporalPrecision: 'year',
      temporalStatus: 'approximate',
    };
  }
  if (/\blast\s+(spring|summer|fall|autumn|winter)\b/.test(lower)) {
    const m = lower.match(/\blast\s+(spring|summer|fall|autumn|winter)\b/);
    const season = m?.[1] ?? 'summer';
    const y = now.getFullYear() - 1;
    return {
      whenText: text,
      startTime: isoUtc(y, SEASON_MONTH[season] ?? 6, 1),
      temporalPrecision: 'season',
      temporalStatus: 'approximate',
    };
  }

  // Date.parse fallback for common locales
  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    return {
      whenText: text,
      startTime: isoUtc(d.getFullYear(), d.getMonth(), d.getDate()),
      temporalPrecision: 'date',
      temporalStatus: approx ? 'approximate' : 'anchored',
    };
  }

  // Keep the phrase for the LLM; no invented anchor.
  return {
    whenText: text,
    startTime: null,
    temporalPrecision: 'unknown',
    temporalStatus: 'unanchored',
  };
}
