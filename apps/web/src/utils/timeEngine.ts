import { parseISO, format, differenceInDays, differenceInHours, differenceInMinutes, differenceInMonths, differenceInYears, addDays, addMonths, addYears, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import { fetchJson } from '../lib/api';

export type TimePrecision = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';

export type TemporalReference = {
  timestamp: Date;
  precision: TimePrecision;
  confidence: number;
  formatted: string;
};

class TimeEngineClient {
  private userTimezone?: string;

  /**
   * Parse timestamp string using backend TimeEngine
   */
  async parseTimestamp(input: string | Date, precision?: TimePrecision): Promise<TemporalReference> {
    if (input instanceof Date) {
      return {
        timestamp: input,
        precision: precision || 'second',
        confidence: 1.0,
        formatted: this.formatTimestamp(input, precision)
      };
    }

    try {
      const result = await fetchJson<{
        timestamp: string;
        precision: TimePrecision;
        confidence: number;
        formatted: string;
      }>('/api/time/parse', {
        method: 'POST',
        body: JSON.stringify({ input, precision, timezone: this.userTimezone })
      });

      return {
        timestamp: parseISO(result.timestamp),
        precision: result.precision,
        confidence: result.confidence,
        formatted: result.formatted
      };
    } catch (error) {
      // Fallback to local parsing
      const date = parseISO(input);
      return {
        timestamp: date,
        precision: precision || 'day',
        confidence: 0.5,
        formatted: this.formatTimestamp(date, precision)
      };
    }
  }

  /**
   * Format timestamp with precision awareness
   */
  formatTimestamp(timestamp: Date | string, precision?: TimePrecision): string {
    const ts = typeof timestamp === 'string' ? parseISO(timestamp) : timestamp;
    const prec = precision || 'day';

    switch (prec) {
      case 'year':
        return format(ts, 'yyyy');
      case 'month':
        return format(ts, 'MMMM yyyy');
      case 'day':
        return format(ts, 'MMMM d, yyyy');
      case 'hour':
        return format(ts, 'MMMM d, yyyy h:mm a');
      case 'minute':
        return format(ts, 'MMMM d, yyyy h:mm:ss a');
      default:
        return format(ts, 'MMMM d, yyyy h:mm:ss a');
    }
  }

  /**
   * Get relative time string (e.g., "2 days ago")
   */
  getRelativeTime(timestamp: Date | string, from: Date = new Date()): string {
    const ts = typeof timestamp === 'string' ? parseISO(timestamp) : timestamp;

    const years = differenceInYears(from, ts);
    if (years > 0) return `${years} year${years !== 1 ? 's' : ''} ago`;

    const months = differenceInMonths(from, ts);
    if (months > 0) return `${months} month${months !== 1 ? 's' : ''} ago`;

    const days = differenceInDays(from, ts);
    if (days > 0) return `${days} day${days !== 1 ? 's' : ''} ago`;

    const hours = differenceInHours(from, ts);
    if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;

    const minutes = differenceInMinutes(from, ts);
    if (minutes <= 1) return 'just now';
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  }

  /**
   * Sort items chronologically
   */
  sortChronologically<T extends { timestamp: Date | string }>(items: T[]): T[] {
    return [...items].sort((a, b) => {
      const dateA = typeof a.timestamp === 'string' ? parseISO(a.timestamp) : a.timestamp;
      const dateB = typeof b.timestamp === 'string' ? parseISO(b.timestamp) : b.timestamp;
      return dateA.getTime() - dateB.getTime();
    });
  }

  /**
   * Group items by time period
   */
  groupByTimePeriod<T extends { timestamp: Date | string }>(
    items: T[],
    period: 'day' | 'week' | 'month' | 'year' = 'day'
  ): Record<string, T[]> {
    const groups: Record<string, T[]> = {};

    items.forEach(item => {
      const ts = typeof item.timestamp === 'string' ? parseISO(item.timestamp) : item.timestamp;
      let key: string;

      switch (period) {
        case 'year':
          key = format(ts, 'yyyy');
          break;
        case 'month':
          key = format(ts, 'yyyy-MM');
          break;
        case 'week':
          key = format(startOfWeek(ts), 'yyyy-MM-dd');
          break;
        default:
          key = format(ts, 'yyyy-MM-dd');
      }

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
    });

    return groups;
  }

  /**
   * Get time boundaries for a period
   */
  getTimeBoundaries(timestamp: Date | string, precision: TimePrecision): { start: Date; end: Date } {
    const ts = typeof timestamp === 'string' ? parseISO(timestamp) : timestamp;

    switch (precision) {
      case 'year':
        return {
          start: startOfYear(ts),
          end: endOfYear(ts)
        };
      case 'month':
        return {
          start: startOfMonth(ts),
          end: endOfMonth(ts)
        };
      case 'day':
        return {
          start: startOfDay(ts),
          end: endOfDay(ts)
        };
      case 'week':
        return {
          start: startOfWeek(ts),
          end: endOfWeek(ts)
        };
      default:
        return {
          start: ts,
          end: ts
        };
    }
  }

  /**
   * Set user timezone
   */
  setUserTimezone(timezone: string) {
    this.userTimezone = timezone;
    // Could also sync with backend (only if authenticated)
    try {
      fetchJson('/api/time/timezone', {
        method: 'POST',
        body: JSON.stringify({ timezone })
      }).catch(() => {
        // Silently fail - user might not be authenticated yet
      });
    } catch {
      // Silently fail - API might not be available
    }
  }

  /**
   * Detect user timezone
   */
  detectTimezone(): string {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return 'UTC';
    }
  }
}

export const timeEngine = new TimeEngineClient();

// Initialize with detected timezone
if (typeof window !== 'undefined') {
  const detected = timeEngine.detectTimezone();
  timeEngine.setUserTimezone(detected);
}

