/** Nullable journal occurrence display/sort. Never treat null as 1970 or today. */

export const JOURNAL_OCCURRENCE_UNKNOWN_LABEL = 'Date unknown';

export function hasJournalOccurrence(date: string | null | undefined): date is string {
  if (!date || !String(date).trim()) return false;
  return Number.isFinite(Date.parse(date));
}

export function formatJournalOccurrenceLabel(date: string | null | undefined): string {
  if (!hasJournalOccurrence(date)) return JOURNAL_OCCURRENCE_UNKNOWN_LABEL;
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function journalOccurrenceMonthKey(date: string | null | undefined): string {
  if (!hasJournalOccurrence(date)) return 'unscheduled';
  return date.slice(0, 7);
}

/** Ascending: known dates first, unknown last. */
export function compareJournalOccurrenceAsc(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const aOk = hasJournalOccurrence(a);
  const bOk = hasJournalOccurrence(b);
  if (!aOk && !bOk) return 0;
  if (!aOk) return 1;
  if (!bOk) return -1;
  return Date.parse(a) - Date.parse(b);
}

export function compareJournalOccurrenceDesc(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  return compareJournalOccurrenceAsc(b, a);
}

export function journalOccurrenceTime(date: string | null | undefined): number | null {
  if (!hasJournalOccurrence(date)) return null;
  return Date.parse(date);
}
