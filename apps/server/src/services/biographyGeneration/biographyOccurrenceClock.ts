/**
 * Biography / reconstruction occurrence clock.
 *
 * Journal `date` is occurrence. `created_at` is recording. Never fall through
 * to created_at, NOW(), or epoch when answering “when did this happen?”
 */
import {
  pickJournalOccurredAt,
  pickJournalRecordedAt,
} from '../temporal/journalOccurrenceRead';

export function biographyJournalOccurrence(entry: {
  date?: string | null;
}): string | null {
  return pickJournalOccurredAt({ date: entry.date ?? null });
}

export function biographyJournalRecordedAt(entry: {
  created_at?: string | null;
}): string | null {
  return pickJournalRecordedAt(entry);
}

export function isUsableOccurrenceTimestamp(value: string | null | undefined): boolean {
  return Boolean(value && Number.isFinite(Date.parse(value)));
}

export function occurrenceSpanFromDates(dates: Array<string | null | undefined>): {
  start: string;
  end: string;
  days: number;
  months: number;
  years: number;
} {
  const parsed = dates
    .map((d) => (d && Number.isFinite(Date.parse(d)) ? Date.parse(d) : null))
    .filter((n): n is number => n != null)
    .sort((a, b) => a - b);

  if (!parsed.length) {
    return { start: '', end: '', days: 0, months: 0, years: 0 };
  }

  const start = parsed[0];
  const end = parsed[parsed.length - 1];
  const diffMs = end - start;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const diffMonths = Math.ceil(diffDays / 30);
  const diffYears = diffDays / 365.25;

  return {
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    days: diffDays,
    months: diffMonths,
    years: Math.round(diffYears * 100) / 100,
  };
}

export function mostActiveOccurrenceMonths(
  entries: Array<{ date?: string | null }>,
): Array<{ month: string; year: number; entryCount: number }> {
  const monthCounts = new Map<string, number>();

  for (const entry of entries) {
    const dateStr = biographyJournalOccurrence(entry);
    if (!dateStr) continue;
    const date = new Date(dateStr);
    if (!Number.isFinite(date.getTime())) continue;
    const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    monthCounts.set(monthKey, (monthCounts.get(monthKey) ?? 0) + 1);
  }

  return Array.from(monthCounts.entries())
    .map(([key, count]) => {
      const [year, month] = key.split('-');
      const date = new Date(Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1));
      return {
        month: date.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }),
        year: parseInt(year, 10),
        entryCount: count,
      };
    })
    .sort((a, b) => b.entryCount - a.entryCount)
    .slice(0, 10);
}
