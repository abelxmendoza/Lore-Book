/** Card/book sort dates — not occurrence authority for “when did this happen?”.
 *  Character Timeline occurrence comes from CanonicalTemporalModel. */

export type CharacterTimelineInput = {
  name?: string;
  created_at?: string | null;
  first_appearance?: string | null;
  metadata?: Record<string, unknown> | null;
};

export function characterCreatedAt(character: CharacterTimelineInput): string | null {
  if (character.created_at) return character.created_at;
  return character.first_appearance ?? null;
}

export function characterFirstMentionedAt(character: CharacterTimelineInput): string | null {
  if (character.first_appearance) return character.first_appearance;
  const meta = character.metadata ?? {};
  return typeof meta.first_mentioned === 'string' ? meta.first_mentioned : null;
}

export function formatCharacterDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  // Format in UTC to match how a bare "YYYY-MM-DD" string parses (UTC
  // midnight) — formatting in the local zone instead can shift the
  // displayed calendar day backward for anyone west of UTC.
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Case-insensitive alphabetical comparator for Array.prototype.sort. */
export function compareCharactersByName(a: CharacterTimelineInput, b: CharacterTimelineInput): number {
  return (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' });
}

function timeOrNull(value: string | null): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Ascending timestamp comparator — entries with no resolvable date sort last. */
export function compareByTimestampAsc(a: string | null, b: string | null): number {
  const ta = timeOrNull(a);
  const tb = timeOrNull(b);
  if (ta === null && tb === null) return 0;
  if (ta === null) return 1;
  if (tb === null) return -1;
  return ta - tb;
}

/** Descending timestamp comparator — entries with no resolvable date sort last. */
export function compareByTimestampDesc(a: string | null, b: string | null): number {
  const ta = timeOrNull(a);
  const tb = timeOrNull(b);
  if (ta === null && tb === null) return 0;
  if (ta === null) return 1;
  if (tb === null) return -1;
  return tb - ta;
}

/** Fills in first_appearance/created_at from metadata when missing, so
 *  downstream sorting/formatting always has the best available date. */
export function withCharacterTimelineDates<T extends CharacterTimelineInput>(character: T): T {
  const meta = character.metadata ?? {};
  const first_appearance =
    character.first_appearance ??
    (typeof meta.first_mentioned === 'string' ? meta.first_mentioned : null);
  const created_at =
    character.created_at ??
    (typeof meta.generated_at === 'string' ? meta.generated_at : null);

  if (first_appearance === character.first_appearance && created_at === character.created_at) {
    return character;
  }
  return { ...character, first_appearance, created_at };
}
