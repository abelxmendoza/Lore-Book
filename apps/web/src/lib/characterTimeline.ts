import type { Character } from '../components/characters/CharacterProfileCard';

type TimelineCharacter = Pick<Character, 'name' | 'first_appearance' | 'created_at' | 'metadata'>;

function asTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : value;
}

function metadataString(metadata: Record<string, unknown> | undefined, key: string): string | null {
  return asTimestamp(metadata?.[key]);
}

/** When this person first showed up in the story (chat, journal, or import). */
export function characterFirstMentionedAt(char: TimelineCharacter): string | null {
  const meta = char.metadata ?? {};
  return (
    asTimestamp(char.first_appearance) ??
    metadataString(meta, 'first_mentioned') ??
    metadataString(meta, 'first_mentioned_at') ??
    metadataString(meta, 'first_seen_at') ??
    null
  );
}

/** When the Character Book card itself was created. */
export function characterCreatedAt(char: TimelineCharacter): string | null {
  const meta = char.metadata ?? {};
  return (
    asTimestamp(char.created_at) ??
    metadataString(meta, 'created_at') ??
    metadataString(meta, 'generated_at') ??
    characterFirstMentionedAt(char)
  );
}

export function formatCharacterDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.slice(0, 10)) && value.length <= 10;
  const date = dateOnly
    ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function compareCharactersByName(a: TimelineCharacter, b: TimelineCharacter): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
}

export function compareByTimestampDesc(a: string | null, b: string | null): number {
  const aTime = a ? Date.parse(a) : 0;
  const bTime = b ? Date.parse(b) : 0;
  return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
}

export function compareByTimestampAsc(a: string | null, b: string | null): number {
  return -compareByTimestampDesc(a, b);
}

/** Fill first_appearance / created_at from metadata so cards and sorts see the same dates. */
export function withCharacterTimelineDates<T extends TimelineCharacter>(char: T): T {
  const firstMentioned = characterFirstMentionedAt(char);
  const created = characterCreatedAt(char);
  return {
    ...char,
    first_appearance: char.first_appearance ?? firstMentioned ?? undefined,
    created_at: char.created_at ?? created ?? undefined,
  };
}
