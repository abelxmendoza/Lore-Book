import type { Character } from '../components/characters/CharacterProfileCard';
import type { CharacterDisplayTitle, TitleStability } from '../api/characterTitle';
import {
  composeDisplayNameWithEpithet,
  resolveStoredEpithet,
  stripPersonNameEpithet,
} from './personNameEpithet';

const STABILITY_LABEL: Record<TitleStability, string> = {
  locked: 'Pinned',
  stable: 'Auto',
  suggested_update: 'Suggested update',
  temporary: 'Temporary',
  needs_resolution: 'Needs resolution',
};

/**
 * Structured names (first/middle/last + aliases) are the source of truth for "who they are".
 * The card/display title is a *presentation* concern: nickname + real name + optional
 * story epithet. Primary `characters.name` stays clean; epithets compose as
 * "Name the Epithet" from metadata.epithet / contextual_title.
 */

export function getStructuredFullName(character: any): string {
  const first = (character.first_name || '').trim();
  const middle = ((character.metadata?.middle_name as string) || character.middle_name || '').trim();
  const last = (character.last_name || '').trim();
  const parts = [first, middle, last].filter(Boolean);
  return parts.length ? parts.join(' ') : stripPersonNameEpithet(character.name || '').trim();
}

function baseIdentityTitle(
  character: Pick<Character, 'name' | 'metadata' | 'first_name' | 'last_name' | 'alias'> & {
    first_name?: string;
    last_name?: string;
    alias?: string[];
  },
): string {
  const meta = character.metadata ?? {};
  const stored = meta.display_title as CharacterDisplayTitle | undefined;
  if (stored?.primaryTitle?.trim()) {
    return stripPersonNameEpithet(stored.primaryTitle.trim());
  }

  const first = (character.first_name || '').trim();
  const last = (character.last_name || '').trim();
  const aliases = getCharacterAliases(character as any);
  const epithet = resolveStoredEpithet(meta as Record<string, unknown>);
  const nickname =
    aliases.find(
      (a) =>
        a &&
        a.toLowerCase() !== first.toLowerCase() &&
        (!epithet || a.toLowerCase() !== epithet.toLowerCase()),
    ) || '';

  if (nickname && first) {
    const base = last ? `${first} ${last}` : first;
    if (nickname.toLowerCase() === base.toLowerCase() || nickname.toLowerCase() === first.toLowerCase()) {
      return base;
    }
    return `${nickname} (${base})`;
  }

  const full = [first, last].filter(Boolean).join(' ').trim();
  if (full) return full;

  return stripPersonNameEpithet(character.name || '').trim() || 'Unknown';
}

export function getCharacterDisplayTitle(
  character: Pick<Character, 'name' | 'metadata' | 'first_name' | 'last_name' | 'alias'> & {
    first_name?: string;
    last_name?: string;
    alias?: string[];
  },
): string {
  const epithet = resolveStoredEpithet((character.metadata ?? {}) as Record<string, unknown>);
  // When an epithet is present, prefer the clean Character Book primary name so
  // kinship titles ("Aunt Maribel") aren't reduced to first-name-only.
  const primary = stripPersonNameEpithet(character.name || '').trim();
  const base = epithet && primary ? primary : baseIdentityTitle(character);
  return composeDisplayNameWithEpithet(base, epithet);
}

export function getCharacterSubtitle(
  character: Pick<Character, 'metadata' | 'name' | 'alias'>,
): string | null {
  const meta = character.metadata ?? {};
  if (typeof meta.character_subtitle === 'string' && meta.character_subtitle.trim()) {
    return meta.character_subtitle.trim();
  }
  // Epithet already lives in the display title — don't repeat as subtitle.
  if (resolveStoredEpithet(meta as Record<string, unknown>)) {
    const stored = meta.display_title as CharacterDisplayTitle | undefined;
    if (stored?.evidencePhrases?.[0]) return stored.evidencePhrases[0];
    return null;
  }
  const stored = meta.display_title as CharacterDisplayTitle | undefined;
  if (stored?.evidencePhrases?.[0]) return stored.evidencePhrases[0];
  return null;
}

export function suggestDisplayTitleFromNames(
  character: any,
  options: { includeContext?: boolean; context?: string } = {},
): string {
  const base = getCharacterDisplayTitle(character);
  if (!options.includeContext) return base;

  const role = (character.role || character.metadata?.role || '').trim();
  const archetype = (character.archetype || '').trim();
  const ctx = options.context || role || archetype;
  if (ctx && !base.toLowerCase().includes(ctx.toLowerCase())) {
    return `${base} — ${ctx}`;
  }
  return base;
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
