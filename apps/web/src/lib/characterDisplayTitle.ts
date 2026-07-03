import type { Character } from '../components/characters/CharacterProfileCard';
import type { CharacterDisplayTitle, TitleStability } from '../api/characterTitle';

const STABILITY_LABEL: Record<TitleStability, string> = {
  locked: 'Locked',
  stable: 'Stable',
  suggested_update: 'Suggested update',
  temporary: 'Temporary',
  needs_resolution: 'Needs resolution',
};

/**
 * Structured names (first/middle/last + aliases) are the source of truth for "who they are".
 * The card/display title is a *presentation* concern: it can be a smart combination
 * of nickname + real first name + optional context for readability in lists/cards.
 * 
 * Never conflate the two. Titles can be user-locked or auto-suggested.
 */

export function getStructuredFullName(character: any): string {
  const first = (character.first_name || '').trim();
  const middle = ((character.metadata?.middle_name as string) || character.middle_name || '').trim();
  const last = (character.last_name || '').trim();
  const parts = [first, middle, last].filter(Boolean);
  return parts.length ? parts.join(' ') : (character.name || '').trim();
}

export function getCharacterDisplayTitle(character: Pick<Character, 'name' | 'metadata' | 'first_name' | 'last_name' | 'alias'> & { first_name?: string; last_name?: string; alias?: string[] }): string {
  const meta = character.metadata ?? {};
  const stored = meta.display_title as CharacterDisplayTitle | undefined;
  if (stored?.primaryTitle?.trim()) {
    return stored.primaryTitle.trim();
  }

  // Auto-generate nice title from structured names when no custom/locked title
  const first = (character.first_name || '').trim();
  const last = (character.last_name || '').trim();
  const aliases = getCharacterAliases(character as any);
  const nickname = aliases.find(a => a && a.toLowerCase() !== first.toLowerCase()) || aliases[0] || '';

  if (nickname && first) {
    const base = last ? `${first} ${last}` : first;
    return `${nickname} (${base})`;
  }

  const full = [first, last].filter(Boolean).join(' ').trim();
  if (full) return full;

  return (character.name || '').trim() || 'Unknown';
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

/**
 * Automatic title generation plan / implementation.
 *
 * Goals:
 * - Prefer user-locked titles (stability === 'locked').
 * - When not locked, derive a human-friendly card title from structured names + primary nickname + light context.
 * - Support "Nickname (First Last)" pattern or "First Last" .
 * - Allow context suffix (role, archetype, or recent note) when it adds value without clutter.
 * - Provide a pure suggest function that can be called on name changes or rescan.
 *
 * Future enhancements (plan):
 * 1. When first/middle/last or alias change in Info tab, if !locked, auto-apply a generated title (or show "Apply suggestion" pill).
 * 2. Use occupation/role from character as optional context: e.g. "Sam (the barista)" or "Jordan Reyes — BJJ instructor".
 * 3. Track title provenance: { source: 'structured_names' | 'user_edited' | 'inferred_role' , generatedAt }
 * 4. On significant evidence (new strong alias from chat), surface suggestion in CharacterTitleSection.
 * 5. Backend can have a /suggest-title endpoint that takes names + recent context snippets.
 * 6. Tests for combinations: no name, only nickname, full with middle (middle ignored in title usually), locked overrides.
 */
export function suggestDisplayTitleFromNames(
  character: any,
  options: { includeContext?: boolean; context?: string } = {}
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
