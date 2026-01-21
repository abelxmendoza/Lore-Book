import { parseISO, format, isBefore, isAfter, isEqual, differenceInDays, differenceInHours, differenceInMinutes, differenceInMonths, differenceInYears, addDays, addMonths, addYears, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

import { logger } from '../logger';

export type TimePrecision = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';

export type TemporalReference = {
  type: 'absolute' | 'relative' | 'fuzzy';
  timestamp: Date;
  precision: TimePrecision;
  originalText?: string;
  confidence: number;
  timezone?: string;
};

export type TimeRange = {
  start: Date;
  end: Date;
  precision: TimePrecision;
};

export type ChronologicalItem<T = any> = {
  item: T;
  timestamp: Date;
  precision: TimePrecision;
  normalizedTimestamp: Date;
};

class TimeEngine {
  private defaultTimezone: string = 'UTC';
  private userTimezone?: string;

  /**
   * Set user's timezone
   */
  setUserTimezone(timezone: string) {
    this.userTimezone = timezone;
  }

  /**
   * Parse a timestamp string to Date with normalization
   * @param defaultToNow - If true, default to current time with higher confidence when no time is found (for real-time chat)
   */
  parseTimestamp(input: string | Date, precision?: TimePrecision, defaultToNow: boolean = true): TemporalReference {
    if (input instanceof Date) {
      return {
        type: 'absolute',
        timestamp: input,
        precision: precision || 'second',
        confidence: 1.0
      };
    }

    // If input is empty or just whitespace, default to now
    if (!input || !input.trim()) {
      return {
        type: 'relative',
        timestamp: new Date(),
        precision: precision || 'day',
        originalText: input || '',
        confidence: defaultToNow ? 0.8 : 0.1 // Higher confidence when defaulting to now
      };
    }

    try {
      // Try ISO format first
      const isoDate = parseISO(input);
      if (!isNaN(isoDate.getTime())) {
        return {
          type: 'absolute',
          timestamp: isoDate,
          precision: this.detectPrecision(input),
          originalText: input,
          confidence: 0.95
        };
      }
    } catch (error) {
      // Continue to relative parsing
    }

    // Try relative time parsing
    const relative = this.parseRelativeTime(input);
    if (relative) {
      return relative;
    }

    // Try to extract date from text
    const extracted = this.extractDateFromText(input);
    if (extracted) {
      return extracted;
    }

    // Default to current time with higher confidence when defaultToNow is true
    return {
      type: 'relative',
      timestamp: new Date(),
      precision: precision || 'day',
      originalText: input,
      confidence: defaultToNow ? 0.7 : 0.1 // Higher confidence for real-time chat
    };
  }

  /**
   * Detect precision from timestamp string
   */
  private detectPrecision(input: string): TimePrecision {
    if (input.includes('T') && input.includes(':')) {
      if (input.split(':').length === 3) return 'second';
      if (input.split(':').length === 2) return 'minute';
      return 'hour';
    }
    if (input.match(/^\d{4}-\d{2}-\d{2}$/)) return 'day';
    if (input.match(/^\d{4}-\d{2}$/)) return 'month';
    if (input.match(/^\d{4}$/)) return 'year';
    return 'day';
  }

  /**
   * Parse relative time expressions
   */
  private parseRelativeTime(input: string): TemporalReference | null {
    const lower = input.toLowerCase().trim();
    const now = new Date();

    // Today
    if (lower === 'today' || lower === 'now' || lower === 'right now' || lower === 'just now') {
      return {
        type: 'relative',
        timestamp: now,
        precision: 'day',
        originalText: input,
        confidence: 0.9
      };
    }

    // Yesterday
    if (lower === 'yesterday') {
      return {
        type: 'relative',
        timestamp: addDays(now, -1),
        precision: 'day',
        originalText: input,
        confidence: 0.9
      };
    }

    // Tomorrow
    if (lower === 'tomorrow') {
      return {
        type: 'relative',
        timestamp: addDays(now, 1),
        precision: 'day',
        originalText: input,
        confidence: 0.9
      };
    }

    // "The other day" - typically 2-3 days ago
    if (lower.match(/the other day/)) {
      return {
        type: 'relative',
        timestamp: addDays(now, -2),
        precision: 'day',
        originalText: input,
        confidence: 0.7
      };
    }

    // "A couple months ago" / "couple of months ago"
    const coupleMonthsMatch = lower.match(/a couple (of )?months? ago/);
    if (coupleMonthsMatch) {
      return {
        type: 'relative',
        timestamp: addMonths(now, -2),
        precision: 'month',
        originalText: input,
        confidence: 0.75
      };
    }

    // "A few months ago" / "few months ago"
    const fewMonthsMatch = lower.match(/a few months? ago/);
    if (fewMonthsMatch) {
      return {
        type: 'relative',
        timestamp: addMonths(now, -3),
        precision: 'month',
        originalText: input,
        confidence: 0.75
      };
    }

    // "A couple weeks ago"
    const coupleWeeksMatch = lower.match(/a couple (of )?weeks? ago/);
    if (coupleWeeksMatch) {
      return {
        type: 'relative',
        timestamp: addDays(now, -14),
        precision: 'day',
        originalText: input,
        confidence: 0.75
      };
    }

    // "A few weeks ago"
    const fewWeeksMatch = lower.match(/a few weeks? ago/);
    if (fewWeeksMatch) {
      return {
        type: 'relative',
        timestamp: addDays(now, -21),
        precision: 'day',
        originalText: input,
        confidence: 0.75
      };
    }

    // "Last year"
    if (lower.match(/last year/)) {
      return {
        type: 'relative',
        timestamp: addYears(now, -1),
        precision: 'year',
        originalText: input,
        confidence: 0.9
      };
    }

    // "In a few weeks" / "in a couple weeks"
    const inFewWeeksMatch = lower.match(/in (a few|a couple (of )?)weeks?/);
    if (inFewWeeksMatch) {
      return {
        type: 'relative',
        timestamp: addDays(now, 14),
        precision: 'day',
        originalText: input,
        confidence: 0.75
      };
    }

    // "When I was..." patterns (kid, in high school, in college, etc.)
    const lifeStageMatch = lower.match(/when i was (a kid|in (high school|college|university|grad school|middle school|elementary school)|younger|young)/);
    if (lifeStageMatch) {
      // Estimate based on typical ages
      const stage = lifeStageMatch[1];
      let yearsAgo = 20; // Default to ~20 years ago
      
      if (stage.includes('kid') || stage.includes('elementary')) {
        yearsAgo = 25;
      } else if (stage.includes('middle school')) {
        yearsAgo = 20;
      } else if (stage.includes('high school')) {
        yearsAgo = 15;
      } else if (stage.includes('college') || stage.includes('university')) {
        yearsAgo = 10;
      } else if (stage.includes('grad school')) {
        yearsAgo = 5;
      }
      
      return {
        type: 'relative',
        timestamp: addYears(now, -yearsAgo),
        precision: 'year',
        originalText: input,
        confidence: 0.6 // Lower confidence due to estimation
      };
    }

    // Year references: "in 2024", "in 2025", "2008", etc.
    const yearMatch = lower.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      const year = parseInt(yearMatch[0]);
      const yearDate = new Date(year, 0, 1);
      return {
        type: 'absolute',
        timestamp: yearDate,
        precision: 'year',
        originalText: input,
        confidence: 0.85
      };
    }

    // "In 2024" / "in 2025" (future years)
    const inYearMatch = lower.match(/in (19|20)\d{2}/);
    if (inYearMatch) {
      const year = parseInt(inYearMatch[1] + inYearMatch[0].slice(-2));
      const yearDate = new Date(year, 0, 1);
      return {
        type: 'absolute',
        timestamp: yearDate,
        precision: 'year',
        originalText: input,
        confidence: 0.85
      };
    }

    // Last/Next week/month/year
    const lastWeekMatch = lower.match(/last\s+week/);
    if (lastWeekMatch) {
      return {
        type: 'relative',
        timestamp: addDays(now, -7),
        precision: 'day',
        originalText: input,
        confidence: 0.85
      };
    }

    const nextWeekMatch = lower.match(/next\s+week/);
    if (nextWeekMatch) {
      return {
        type: 'relative',
        timestamp: addDays(now, 7),
        precision: 'day',
        originalText: input,
        confidence: 0.85
      };
    }

    const lastMonthMatch = lower.match(/last\s+month/);
    if (lastMonthMatch) {
      return {
        type: 'relative',
        timestamp: addMonths(now, -1),
        precision: 'month',
        originalText: input,
        confidence: 0.85
      };
    }

    const nextMonthMatch = lower.match(/next\s+month/);
    if (nextMonthMatch) {
      return {
        type: 'relative',
        timestamp: addMonths(now, 1),
        precision: 'month',
        originalText: input,
        confidence: 0.85
      };
    }

    // X days/weeks/months/years ago
    const agoMatch = lower.match(/(\d+)\s+(day|week|month|year)s?\s+ago/);
    if (agoMatch) {
      const amount = parseInt(agoMatch[1]);
      const unit = agoMatch[2];
      let timestamp = now;

      switch (unit) {
        case 'day':
          timestamp = addDays(now, -amount);
          break;
        case 'week':
          timestamp = addDays(now, -amount * 7);
          break;
        case 'month':
          timestamp = addMonths(now, -amount);
          break;
        case 'year':
          timestamp = addYears(now, -amount);
          break;
      }

      return {
        type: 'relative',
        timestamp,
        precision: unit === 'year' ? 'year' : unit === 'month' ? 'month' : 'day',
        originalText: input,
        confidence: 0.8
      };
    }

    // In X days/weeks/months/years
    const inMatch = lower.match(/in\s+(\d+)\s+(day|week|month|year)s?/);
    if (inMatch) {
      const amount = parseInt(inMatch[1]);
      const unit = inMatch[2];
      let timestamp = now;

      switch (unit) {
        case 'day':
          timestamp = addDays(now, amount);
          break;
        case 'week':
          timestamp = addDays(now, amount * 7);
          break;
        case 'month':
          timestamp = addMonths(now, amount);
          break;
        case 'year':
          timestamp = addYears(now, amount);
          break;
      }

      return {
        type: 'relative',
        timestamp,
        precision: unit === 'year' ? 'year' : unit === 'month' ? 'month' : 'day',
        originalText: input,
        confidence: 0.8
      };
    }

    return null;
  }

  /**
   * Extract date from natural language text
   */
  private extractDateFromText(input: string): TemporalReference | null {
    // Try common date formats
    const datePatterns = [
      /(\d{1,2})\/(\d{1,2})\/(\d{4})/, // MM/DD/YYYY
      /(\d{4})-(\d{1,2})-(\d{1,2})/, // YYYY-MM-DD
      /(\w+)\s+(\d{1,2}),?\s+(\d{4})/, // Month DD, YYYY
    ];

    for (const pattern of datePatterns) {
      const match = input.match(pattern);
      if (match) {
        try {
          const dateStr = match[0];
          const parsed = parseISO(dateStr.includes('/') ? dateStr.split('/').reverse().join('-') : dateStr);
          if (!isNaN(parsed.getTime())) {
            return {
              type: 'absolute',
              timestamp: parsed,
              precision: 'day',
              originalText: input,
              confidence: 0.7
            };
          }
        } catch (error) {
          // Continue to next pattern
        }
      }
    }

    return null;
  }

  /**
   * Normalize timestamp to UTC with precision handling
   */
  normalizeTimestamp(timestamp: Date, precision: TimePrecision, timezone?: string): Date {
    const tz = timezone || this.userTimezone || this.defaultTimezone;
    
    // Convert to UTC if timezone provided
    let normalized = timestamp;
    if (tz !== 'UTC') {
      try {
        normalized = fromZonedTime(timestamp, tz);
      } catch (error) {
        logger.debug({ error, tz }, 'Failed to convert timezone, using UTC');
      }
    }

    // Apply precision normalization
    switch (precision) {
      case 'year':
        return new Date(normalized.getFullYear(), 0, 1);
      case 'month':
        return new Date(normalized.getFullYear(), normalized.getMonth(), 1);
      case 'day':
        return startOfDay(normalized);
      case 'hour':
        return new Date(normalized.getFullYear(), normalized.getMonth(), normalized.getDate(), normalized.getHours());
      case 'minute':
        return new Date(normalized.getFullYear(), normalized.getMonth(), normalized.getDate(), normalized.getHours(), normalized.getMinutes());
      default:
        return normalized;
    }
  }

  /**
   * Sort items chronologically
   */
  sortChronologically<T>(items: Array<{ timestamp: Date | string; [key: string]: any }>): ChronologicalItem<T>[] {
    return items
      .map(item => {
        const timestamp = typeof item.timestamp === 'string' ? parseISO(item.timestamp) : item.timestamp;
        const ref = this.parseTimestamp(timestamp);
        return {
          item: item as T,
          timestamp: ref.timestamp,
          precision: ref.precision,
          normalizedTimestamp: this.normalizeTimestamp(ref.timestamp, ref.precision)
        };
      })
      .sort((a, b) => {
        // Sort by normalized timestamp first
        const timeDiff = a.normalizedTimestamp.getTime() - b.normalizedTimestamp.getTime();
        if (timeDiff !== 0) return timeDiff;

        // If same normalized time, sort by precision (more precise = later)
        const precisionOrder: Record<TimePrecision, number> = {
          year: 1,
          month: 2,
          day: 3,
          hour: 4,
          minute: 5,
          second: 6
        };
        return precisionOrder[a.precision] - precisionOrder[b.precision];
      });
  }

  /**
   * Create time range from start and end
   */
  createTimeRange(start: string | Date, end: string | Date, precision: TimePrecision = 'day'): TimeRange {
    const startRef = this.parseTimestamp(start);
    const endRef = this.parseTimestamp(end);
    
    const normalizedStart = this.normalizeTimestamp(startRef.timestamp, precision);
    const normalizedEnd = this.normalizeTimestamp(endRef.timestamp, precision);

    // Ensure end is after start
    const finalEnd = isAfter(normalizedEnd, normalizedStart) ? normalizedEnd : normalizedStart;

    return {
      start: normalizedStart,
      end: finalEnd,
      precision
    };
  }

  /**
   * Check if timestamp is within range
   */
  isInRange(timestamp: Date | string, range: TimeRange): boolean {
    const ts = typeof timestamp === 'string' ? parseISO(timestamp) : timestamp;
    const ref = this.parseTimestamp(ts);
    const normalized = this.normalizeTimestamp(ref.timestamp, range.precision);

    return (
      (isEqual(normalized, range.start) || isAfter(normalized, range.start)) &&
      (isEqual(normalized, range.end) || isBefore(normalized, range.end))
    );
  }

  /**
   * Get time difference in human-readable format
   */
  getTimeDifference(from: Date | string, to: Date | string = new Date()): {
    value: number;
    unit: string;
    human: string;
  } {
    const fromDate = typeof from === 'string' ? parseISO(from) : from;
    const toDate = typeof to === 'string' ? parseISO(to) : to;

    const years = differenceInYears(toDate, fromDate);
    if (years > 0) {
      return {
        value: years,
        unit: 'year',
        human: `${years} year${years !== 1 ? 's' : ''} ago`
      };
    }

    const months = differenceInMonths(toDate, fromDate);
    if (months > 0) {
      return {
        value: months,
        unit: 'month',
        human: `${months} month${months !== 1 ? 's' : ''} ago`
      };
    }

    const days = differenceInDays(toDate, fromDate);
    if (days > 0) {
      return {
        value: days,
        unit: 'day',
        human: `${days} day${days !== 1 ? 's' : ''} ago`
      };
    }

    const hours = differenceInHours(toDate, fromDate);
    if (hours > 0) {
      return {
        value: hours,
        unit: 'hour',
        human: `${hours} hour${hours !== 1 ? 's' : ''} ago`
      };
    }

    const minutes = differenceInMinutes(toDate, fromDate);
    return {
      value: minutes,
      unit: 'minute',
      human: minutes <= 1 ? 'just now' : `${minutes} minute${minutes !== 1 ? 's' : ''} ago`
    };
  }

  /**
   * Format timestamp with precision awareness
   */
  formatTimestamp(timestamp: Date | string, precision?: TimePrecision, timezone?: string): string {
    const ts = typeof timestamp === 'string' ? parseISO(timestamp) : timestamp;
    const ref = this.parseTimestamp(ts);
    const prec = precision || ref.precision;
    const tz = timezone || this.userTimezone || this.defaultTimezone;

    let date = ts;
    if (tz !== 'UTC') {
      try {
        date = toZonedTime(ts, tz);
      } catch (error) {
        logger.debug({ error, tz }, 'Failed to convert to timezone');
      }
    }

    switch (prec) {
      case 'year':
        return format(date, 'yyyy');
      case 'month':
        return format(date, 'MMMM yyyy');
      case 'day':
        return format(date, 'MMMM d, yyyy');
      case 'hour':
        return format(date, 'MMMM d, yyyy h:mm a');
      case 'minute':
        return format(date, 'MMMM d, yyyy h:mm:ss a');
      default:
        return format(date, 'MMMM d, yyyy h:mm:ss a');
    }
  }

  /**
   * Detect temporal conflicts between timestamps
   */
  detectTemporalConflicts(timestamps: Array<Date | string>, thresholdMinutes: number = 60): Array<{
    timestamp1: Date;
    timestamp2: Date;
    difference: number;
    conflict: boolean;
  }> {
    const parsed = timestamps.map(ts => typeof ts === 'string' ? parseISO(ts) : ts);
    const conflicts: Array<{
      timestamp1: Date;
      timestamp2: Date;
      difference: number;
      conflict: boolean;
    }> = [];

    for (let i = 0; i < parsed.length; i++) {
      for (let j = i + 1; j < parsed.length; j++) {
        const diff = Math.abs(differenceInMinutes(parsed[i], parsed[j]));
        conflicts.push({
          timestamp1: parsed[i],
          timestamp2: parsed[j],
          difference: diff,
          conflict: diff < thresholdMinutes
        });
      }
    }

    return conflicts.filter(c => c.conflict);
  }

  /**
   * Get time boundaries for a given precision
   */
  getTimeBoundaries(timestamp: Date | string, precision: TimePrecision): { start: Date; end: Date } {
    const ts = typeof timestamp === 'string' ? parseISO(timestamp) : timestamp;
    const normalized = this.normalizeTimestamp(ts, precision);

    switch (precision) {
      case 'year':
        return {
          start: startOfYear(normalized),
          end: endOfYear(normalized)
        };
      case 'month':
        return {
          start: startOfMonth(normalized),
          end: endOfMonth(normalized)
        };
      case 'day':
        return {
          start: startOfDay(normalized),
          end: endOfDay(normalized)
        };
      case 'week':
        return {
          start: startOfWeek(normalized),
          end: endOfWeek(normalized)
        };
      default:
        return {
          start: normalized,
          end: normalized
        };
    }
  }
}

export const timeEngine = new TimeEngine();

