import type { ChronologyEntry } from '../../types/timelineV2';

export function sortEntriesChronologically(entries: ChronologyEntry[]): ChronologyEntry[] {
  return [...entries].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );
}

export function sortEntriesNewestFirst(entries: ChronologyEntry[]): ChronologyEntry[] {
  return [...entries].sort(
    (a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
  );
}

export type DateGroup = {
  dateKey: string;
  label: string;
  weekday: string;
  entries: ChronologyEntry[];
};

export function groupEntriesByDate(entries: ChronologyEntry[]): DateGroup[] {
  const sorted = sortEntriesChronologically(entries);
  const map = new Map<string, ChronologyEntry[]>();

  for (const entry of sorted) {
    const dateKey = entry.start_time.slice(0, 10);
    if (!map.has(dateKey)) map.set(dateKey, []);
    map.get(dateKey)!.push(entry);
  }

  return [...map.entries()].map(([dateKey, groupEntries]) => {
    const d = new Date(dateKey + 'T12:00:00');
    return {
      dateKey,
      label: d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      weekday: d.toLocaleDateString('en-US', { weekday: 'long' }),
      entries: groupEntries,
    };
  });
}

export function formatEventDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatEventDateCompact(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatEventTime(iso: string): string | null {
  const d = new Date(iso);
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) return null;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
