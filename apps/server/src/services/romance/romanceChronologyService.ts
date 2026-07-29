/**
 * Romance chronology composition.
 *
 * Dating & Romance timelines should never look empty when the user already has
 * evidence in romantic_dates, romantic_interactions, or the relationship bond
 * window. This module projects those sources into one date-shaped list the
 * web Timeline tab already understands.
 */

export type RomanceChronologySource = 'date' | 'interaction' | 'relationship';

export type RomanceChronologyEvent = {
  id: string;
  date_type: string;
  date_time: string;
  location?: string | null;
  description?: string | null;
  sentiment?: number | null;
  was_positive?: boolean | null;
  source_message_id?: string | null;
  source?: RomanceChronologySource;
  interaction_type?: string;
};

export type RomanceDateRow = {
  id: string;
  date_type: string;
  date_time: string;
  location?: string | null;
  description?: string | null;
  sentiment?: number | null;
  was_positive?: boolean | null;
  source_message_id?: string | null;
};

export type RomanceInteractionRow = {
  id: string;
  interaction_type: string;
  interaction_date: string;
  location?: string | null;
  description?: string | null;
  sentiment?: number | null;
  was_positive?: boolean | null;
  source_message_id?: string | null;
};

export type RomanceBondMeta = {
  id: string;
  start_date?: string | null;
  person_name?: string | null;
};

/** Map interaction types onto romantic_dates CHECK-compatible date_type values. */
export const INTERACTION_TO_DATE_TYPE: Record<string, string> = {
  date: 'special_date',
  meetup: 'special_date',
  sleepover: 'first_sleepover',
  intimate: 'milestone',
  conflict: 'first_fight',
  celebration: 'anniversary',
  gift: 'special_date',
  support: 'milestone',
  text: 'other',
  call: 'other',
  video_call: 'other',
  other: 'other',
};

function interactionLabel(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Merge canonical dates with interactions (deduped by source_message_id) and,
 * when still empty, surface the bond start as a first_meeting milestone.
 */
export function composeRomanceChronology(
  dates: RomanceDateRow[],
  interactions: RomanceInteractionRow[],
  bond?: RomanceBondMeta | null,
): RomanceChronologyEvent[] {
  const messageIdsFromDates = new Set(
    dates
      .map((d) => d.source_message_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  );

  const fromDates: RomanceChronologyEvent[] = dates.map((d) => ({
    ...d,
    source: 'date' as const,
  }));

  const fromInteractions: RomanceChronologyEvent[] = interactions
    .filter((row) => {
      const mid = row.source_message_id;
      return !(typeof mid === 'string' && mid.length > 0 && messageIdsFromDates.has(mid));
    })
    .map((row) => ({
      id: `interaction:${row.id}`,
      date_type: INTERACTION_TO_DATE_TYPE[row.interaction_type] ?? 'other',
      date_time: row.interaction_date,
      location: row.location ?? null,
      description:
        row.description?.trim() ||
        `${interactionLabel(row.interaction_type)} with ${bond?.person_name?.trim() || 'them'}`,
      sentiment: row.sentiment ?? null,
      was_positive: row.was_positive ?? null,
      source_message_id: row.source_message_id ?? null,
      source: 'interaction' as const,
      interaction_type: row.interaction_type,
    }));

  const merged = [...fromDates, ...fromInteractions].sort(
    (a, b) => new Date(b.date_time).getTime() - new Date(a.date_time).getTime(),
  );

  if (merged.length > 0) return merged;

  const start = bond?.start_date?.trim();
  if (!start || Number.isNaN(new Date(start).getTime())) return [];

  return [
    {
      id: `bond-start:${bond!.id}`,
      date_type: 'first_meeting',
      date_time: start,
      description: bond?.person_name?.trim()
        ? `Connection with ${bond.person_name.trim()} began`
        : 'Connection began',
      was_positive: true,
      sentiment: 0.6,
      source: 'relationship',
    },
  ];
}
