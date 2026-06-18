/**
 * Precision normalization and stored-timestamp parsing for chronology/analytics.
 * Use temporalResolver for natural-language parsing — this module is for ISO/stored values.
 */
import {
  parseISO,
  isValid,
  startOfDay,
  differenceInMinutes,
} from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';

import { logger } from '../logger';

export type TimePrecision = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';

export type StoredTimestamp = {
  timestamp: Date;
  precision: TimePrecision;
  confidence: number;
};

export function detectPrecisionFromIso(input: string): TimePrecision {
  if (input.includes('T') && input.includes(':')) {
    const colonCount = input.split(':').length - 1;
    if (colonCount >= 2) return 'second';
    if (colonCount === 1) return 'minute';
    return 'hour';
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return 'day';
  if (/^\d{4}-\d{2}$/.test(input)) return 'month';
  if (/^\d{4}$/.test(input)) return 'year';
  return 'day';
}

/** Parse a persisted ISO timestamp (not NL text). */
export function parseStoredTimestamp(input: string | Date): StoredTimestamp {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) {
      throw new Error('Invalid Date');
    }
    return { timestamp: input, precision: 'second', confidence: 1.0 };
  }

  const trimmed = input?.trim();
  if (!trimmed) {
    throw new Error('Empty timestamp');
  }

  const parsed = parseISO(trimmed);
  if (!isValid(parsed)) {
    throw new Error(`Invalid ISO timestamp: ${trimmed}`);
  }

  return {
    timestamp: parsed,
    precision: detectPrecisionFromIso(trimmed),
    confidence: 0.95,
  };
}

/** Floor a timestamp to the given precision bucket (UTC-oriented). */
export function normalizeTimestamp(
  timestamp: Date,
  precision: TimePrecision,
  timezone = 'UTC'
): Date {
  let normalized = timestamp;
  if (timezone !== 'UTC') {
    try {
      normalized = fromZonedTime(timestamp, timezone);
    } catch (error) {
      logger.debug({ error, timezone }, 'Failed to convert timezone, using UTC');
    }
  }

  switch (precision) {
    case 'year':
      return new Date(normalized.getFullYear(), 0, 1);
    case 'month':
      return new Date(normalized.getFullYear(), normalized.getMonth(), 1);
    case 'day':
      return startOfDay(normalized);
    case 'hour':
      return new Date(
        normalized.getFullYear(),
        normalized.getMonth(),
        normalized.getDate(),
        normalized.getHours()
      );
    case 'minute':
      return new Date(
        normalized.getFullYear(),
        normalized.getMonth(),
        normalized.getDate(),
        normalized.getHours(),
        normalized.getMinutes()
      );
    default:
      return normalized;
  }
}

export function detectTemporalConflicts(
  timestamps: Array<Date | string>,
  thresholdMinutes = 60
): Array<{
  timestamp1: Date;
  timestamp2: Date;
  difference: number;
  conflict: boolean;
}> {
  const parsed = timestamps.map((ts) => (typeof ts === 'string' ? parseISO(ts) : ts));
  const conflicts: Array<{
    timestamp1: Date;
    timestamp2: Date;
    difference: number;
    conflict: boolean;
  }> = [];

  for (let i = 0; i < parsed.length; i++) {
    for (let j = i + 1; j < parsed.length; j++) {
      const diff = Math.abs(differenceInMinutes(parsed[i], parsed[j]));
      if (diff < thresholdMinutes) {
        conflicts.push({
          timestamp1: parsed[i],
          timestamp2: parsed[j],
          difference: diff,
          conflict: true,
        });
      }
    }
  }

  return conflicts;
}
