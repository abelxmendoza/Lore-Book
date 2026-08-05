type TimelineCharacterCandidate = {
  id: string;
  name: string;
  first_name?: string | null;
  alias?: string[] | null;
  role?: string | null;
  archetype?: string | null;
  importance_score?: number | null;
  metadata?: Record<string, unknown> | null;
};

type TimelineCharacterContext = {
  content?: string | null;
  title?: string | null;
  timeline_names?: string[] | null;
};

function containsPhrase(text: string, phrase: string): boolean {
  const normalizedPhrase = phrase.trim().toLocaleLowerCase();
  if (!normalizedPhrase) return false;
  const escaped = normalizedPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
}

function isRomanticCandidate(character: TimelineCharacterCandidate): boolean {
  const relationshipType = String(character.metadata?.relationship_type ?? '');
  return /romantic|girlfriend|boyfriend|partner|dating|spouse/i.test(
    `${character.role ?? ''} ${character.archetype ?? ''} ${relationshipType}`,
  );
}

/**
 * Resolve a person-focused timeline back to its Character Book record.
 *
 * Demo timelines do not carry canonical entity IDs, so this deliberately uses
 * only explicit names/aliases from the query or clicked event. When several
 * demo people share a first name, timeline context (for example a Love lane)
 * and then Character Book importance provide a deterministic tie-break.
 */
export function findTimelineSubjectCharacter<T extends TimelineCharacterCandidate>(
  query: string,
  event: TimelineCharacterContext | null | undefined,
  characters: T[],
): T | null {
  const text = [query, event?.title, event?.content, ...(event?.timeline_names ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();
  const romanticContext = /love|romance|relationship|dating|partner|heartbreak|commitment|first date/i.test(text);

  const ranked = characters
    .map((character, index) => {
      const fullName = character.name.trim();
      const firstName = character.first_name?.trim() ?? '';
      const aliases = (character.alias ?? []).filter((alias) => alias.trim().length > 0);
      let score = 0;

      if (containsPhrase(text, fullName)) score += fullName.includes(' ') ? 120 : 55;
      if (firstName && containsPhrase(text, firstName)) score += 30;
      for (const alias of aliases) {
        if (containsPhrase(text, alias)) score += alias.includes(' ') ? 80 : 35;
      }

      if (score === 0) return null;
      if (romanticContext && isRomanticCandidate(character)) score += 75;
      score += Math.max(0, Number(character.importance_score ?? 0)) / 100;

      return { character, score, index };
    })
    .filter((result): result is { character: T; score: number; index: number } => result !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  return ranked[0]?.character ?? null;
}
