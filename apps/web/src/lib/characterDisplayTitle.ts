import type { Character } from '../components/characters/CharacterProfileCard';
import type { CharacterDisplayTitle, TitleStability } from '../api/characterTitle';

const STABILITY_LABEL: Record<TitleStability, string> = {
  locked: 'Locked',
  stable: 'Stable',
  suggested_update: 'Suggested update',
  temporary: 'Temporary',
  needs_resolution: 'Needs resolution',
};

export function getCharacterDisplayTitle(character: Pick<Character, 'name' | 'metadata'>): string {
  const meta = character.metadata ?? {};
  const stored = meta.display_title as CharacterDisplayTitle | undefined;
  return stored?.primaryTitle?.trim() || character.name?.trim() || 'Unknown';
}

export function getCharacterSubtitle(character: Pick<Character, 'metadata'>): string | null {
  const meta = character.metadata ?? {};
  if (typeof meta.character_subtitle === 'string' && meta.character_subtitle.trim()) {
    return meta.character_subtitle.trim();
  }
  const stored = meta.display_title as CharacterDisplayTitle | undefined;
  if (stored?.evidencePhrases?.[0]) return stored.evidencePhrases[0];
  return null;
}

export function getTitleStability(character: Pick<Character, 'metadata'>): TitleStability {
  const meta = character.metadata ?? {};
  const stored = meta.display_title as CharacterDisplayTitle | undefined;
  return stored?.stability ?? 'stable';
}

export function getTitleStabilityLabel(character: Pick<Character, 'metadata'>): string {
  return STABILITY_LABEL[getTitleStability(character)];
}

export function getCharacterAliases(character: Pick<Character, 'metadata' | 'alias'>): string[] {
  const meta = character.metadata ?? {};
  const stored = meta.display_title as CharacterDisplayTitle | undefined;
  const fromTitle = stored?.aliases?.map((a) => a.value) ?? [];
  const legacy = character.alias ?? [];
  return [...new Set([...fromTitle, ...legacy].filter(Boolean))];
}
