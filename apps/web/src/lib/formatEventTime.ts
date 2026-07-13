/**
 * Honest event-time formatting: display exactly as much precision as the
 * evidence supports, never fake clock precision inherited from timestamps.
 */
import { format, parseISO } from 'date-fns';

export type TemporalEventLike = {
  start_time?: string | null;
  temporal_precision?: string | null;
  temporal_status?: string | null;
  timezone?: string | null;
};

function seasonOf(month: number): string {
  if (month <= 1 || month === 11) return 'Winter';
  if (month <= 4) return 'Spring';
  if (month <= 7) return 'Summer';
  return 'Fall';
}

export function formatEventTime(event: TemporalEventLike, opts: { full?: boolean } = {}): string {
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

  const approx =
    temporal_status === 'approximate' || temporal_status === 'ambiguous' ? '~' : '';

  switch (temporal_precision) {
    case 'exact':
      return approx + format(d, opts.full ? 'EEEE, MMMM d, yyyy · h:mm a' : 'MMM d, yyyy h:mm a');
    case 'time_of_day':
    case 'date':
      return approx + format(d, opts.full ? 'EEEE, MMMM d, yyyy' : 'MMM d, yyyy');
    case 'month':
      return approx + format(d, 'MMMM yyyy');
    case 'season':
      return `${approx}${seasonOf(d.getMonth())} ${format(d, 'yyyy')}`;
    case 'year':
      return approx + format(d, 'yyyy');
    default:
      // Legacy rows without precision metadata: show the date but never the
      // fabricated clock time.
      return approx + format(d, opts.full ? 'EEEE, MMMM d, yyyy' : 'MMM d, yyyy');
  }
}
