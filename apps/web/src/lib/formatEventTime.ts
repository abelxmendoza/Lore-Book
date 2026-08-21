/**
 * Honest event-time formatting: display exactly as much precision as the
 * evidence supports, never fake clock precision inherited from timestamps.
 *
 * Civil dates use the event timezone, else an explicit display zone, else the
 * user's IANA zone (same source as X-User-Timezone). Never UTC-prefix slicing.
 */
import { parseISO } from 'date-fns';

export type TemporalEventLike = {
  start_time?: string | null;
  temporal_precision?: string | null;
  temporal_status?: string | null;
  timezone?: string | null;
};

function seasonOf(monthIndex: number): string {
  if (monthIndex <= 1 || monthIndex === 11) return 'Winter';
  if (monthIndex <= 4) return 'Spring';
  if (monthIndex <= 7) return 'Summer';
  return 'Fall';
}

export function resolveDisplayTimeZone(
  event: TemporalEventLike,
  fallback?: string,
): string {
  if (event.timezone) return event.timezone;
  if (fallback) return fallback;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function formatParts(
  date: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone }).format(date);
}

function monthIndexInZone(date: Date, timeZone: string): number {
  const raw = formatParts(date, timeZone, { month: 'numeric' });
  const month = Number.parseInt(raw, 10);
  return Number.isFinite(month) ? month - 1 : date.getUTCMonth();
}

export function formatEventTime(
  event: TemporalEventLike,
  opts: { full?: boolean; timeZone?: string } = {},
): string {
  const { start_time, temporal_precision, temporal_status } = event;
  if (!start_time || temporal_precision === 'unknown' || temporal_status === 'unanchored') {
    return 'Date unknown';
  }
  let d: Date;
  try {
    d = parseISO(start_time);
    if (Number.isNaN(d.getTime())) return 'Date unknown';
  } catch {
    return 'Date unknown';
  }

  const timeZone = resolveDisplayTimeZone(event, opts.timeZone);
  const approx =
    temporal_status === 'approximate' || temporal_status === 'ambiguous' ? '~' : '';

  const dateShort = formatParts(d, timeZone, { month: 'short', day: 'numeric', year: 'numeric' });
  const dateLong = formatParts(d, timeZone, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const time = formatParts(d, timeZone, { hour: 'numeric', minute: '2-digit' });
  const monthYear = formatParts(d, timeZone, { month: 'long', year: 'numeric' });
  const year = formatParts(d, timeZone, { year: 'numeric' });

  switch (temporal_precision) {
    case 'exact':
      return approx + (opts.full ? `${dateLong} · ${time}` : `${dateShort} ${time}`);
    case 'time_of_day':
    case 'date':
      return approx + (opts.full ? dateLong : dateShort);
    case 'month':
      return approx + monthYear;
    case 'season':
      return `${approx}${seasonOf(monthIndexInZone(d, timeZone))} ${year}`;
    case 'year':
      return approx + year;
    default:
      return approx + (opts.full ? dateLong : dateShort);
  }
}
