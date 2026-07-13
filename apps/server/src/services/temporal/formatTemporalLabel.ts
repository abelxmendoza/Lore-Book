/**
 * Server-side honest temporal label (mirror of web formatEventTime): render
 * exactly the precision the evidence supports — for prompts, exports, and
 * anywhere the model or user reads event time as text.
 */

type Eventish = {
  start_time?: string | null;
  temporal_precision?: string | null;
  temporal_status?: string | null;
};

function seasonOf(month: number): string {
  if (month <= 1 || month === 11) return 'Winter';
  if (month <= 4) return 'Spring';
  if (month <= 7) return 'Summer';
  return 'Fall';
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export function formatTemporalLabel(event: Eventish): string {
  const { start_time, temporal_precision, temporal_status } = event;
  if (!start_time || temporal_precision === 'unknown' || temporal_status === 'unanchored') {
    return 'date unknown';
  }
  const d = new Date(start_time);
  if (Number.isNaN(d.getTime())) return 'date unknown';
  const approx = temporal_status === 'approximate' || temporal_status === 'ambiguous' ? '~' : '';
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  switch (temporal_precision) {
    case 'exact':
      return `${approx}${start_time}`;
    case 'month':
      return `${approx}${MONTHS[m]} ${y}`;
    case 'season':
      return `${approx}${seasonOf(m)} ${y}`;
    case 'year':
      return `${approx}${y}`;
    case 'time_of_day':
    case 'date':
    default:
      return `${approx}${MONTHS[m]} ${d.getUTCDate()}, ${y}`;
  }
}
