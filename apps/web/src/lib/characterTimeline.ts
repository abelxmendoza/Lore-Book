/** Small formatting helpers for the Character Info panel's "Card added" /
 *  "First mentioned" stat cells. */

type CharacterTimelineInput = {
  created_at?: string | null;
  first_appearance?: string | null;
  metadata?: Record<string, unknown> | null;
};

export function characterCreatedAt(character: CharacterTimelineInput): string | null {
  return character.created_at ?? null;
}

export function characterFirstMentionedAt(character: CharacterTimelineInput): string | null {
  if (character.first_appearance) return character.first_appearance;
  const meta = character.metadata ?? {};
  return typeof meta.first_mentioned_at === 'string' ? meta.first_mentioned_at : null;
}

export function formatCharacterDate(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
