/**
 * Read-time helpers for nullable journal occurrence (journal_entries.date).
 * Recording time is created_at. Do not substitute NOW() or epoch.
 */

export function formatJournalOccurrence(date: string | null | undefined): string {
  if (!date || !String(date).trim()) return 'Date unknown';
  const t = Date.parse(date);
  if (!Number.isFinite(t)) return 'Date unknown';
  return new Date(t).toISOString();
}

/** Ascending occurrence sort: dated first, unknown last. Never 1970 / today sentinels. */
export function compareJournalOccurrenceAsc(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const at = a ? Date.parse(a) : Number.NaN;
  const bt = b ? Date.parse(b) : Number.NaN;
  const aOk = Number.isFinite(at);
  const bOk = Number.isFinite(bt);
  if (!aOk && !bOk) return 0;
  if (!aOk) return 1;
  if (!bOk) return -1;
  return at - bt;
}

export function compareJournalOccurrenceDesc(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  return compareJournalOccurrenceAsc(b, a);
}

export function jsonRoundTripPreservesNullDate(row: { date: string | null }): boolean {
  const cloned = JSON.parse(JSON.stringify(row)) as { date: string | null };
  return cloned.date === row.date;
}

/** Supabase/PostgREST occurrence sort: newest dated first, unknown last. */
export const JOURNAL_OCCURRENCE_ORDER_DESC = { ascending: false as const, nullsFirst: false };

export function pickJournalOccurredAt(entry: {
  date?: string | null;
  timestamp?: string | null;
}): string | null {
  if (entry.date && Number.isFinite(Date.parse(entry.date))) return entry.date;
  if (entry.timestamp && Number.isFinite(Date.parse(entry.timestamp))) return entry.timestamp;
  return null;
}

/** Recording time only. Never invent now() as occurrence. */
export function pickJournalRecordedAt(entry: { created_at?: string | null }): string | null {
  if (entry.created_at && Number.isFinite(Date.parse(entry.created_at))) return entry.created_at;
  return null;
}
