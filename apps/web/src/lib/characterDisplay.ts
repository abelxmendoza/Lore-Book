import type { Character } from '../components/characters/CharacterProfileCard';
import { stripPersonNameEpithet } from './personNameEpithet';

export function getCharacterRealName(character: Pick<Character, 'name' | 'first_name' | 'last_name' | 'metadata'>): string | null {
  const meta = character.metadata ?? {};
  if (typeof meta.real_name === 'string' && meta.real_name.trim()) return meta.real_name.trim();
  if (character.first_name && character.last_name) {
    return `${character.first_name} ${character.last_name}`.trim();
  }
  if (character.first_name && !/^me$/i.test(character.first_name)) return character.first_name;
  return null;
}

const JOKE_PROTAGONIST_HOOK_RE =
  /interview on the horizon|warehouse diagnostics|between-arc transition|caffeine and firmware|resume lore|field-ops protagonist|epirus enters the chat/i;

export function getCharacterWittyTagline(character: Pick<Character, 'metadata' | 'summary'>): string | null {
  const meta = character.metadata ?? {};
  const witty =
    (typeof meta.witty_tagline === 'string' && meta.witty_tagline) ||
    (typeof meta.character_blurb === 'string' && meta.character_blurb) ||
    null;
  return sanitizeProtagonistTagline(witty);
}

/** Joke/template protagonist copy — never show this as a biography. */
export function isTemplateProtagonistBlurb(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  return /main character energy|builder of timelines and trouble|legally required to remember|protagonist log|certified protagonist|side quests optional|still collecting plot twists/i.test(
    text,
  );
}

export function sanitizeProtagonistTagline(text: string | null | undefined): string | null {
  if (!text?.trim() || isTemplateProtagonistBlurb(text)) return null;
  return text;
}

export function filterCharacterContextHooks(hooks: string[]): string[] {
  return hooks.filter(
    (hook) => typeof hook === 'string' && hook.trim().length > 0 && !JOKE_PROTAGONIST_HOOK_RE.test(hook),
  );
}

export function getCharacterContextHooks(character: Pick<Character, 'metadata'>): string[] {
  const meta = character.metadata ?? {};
  const hooks = Array.isArray(meta.context_hooks)
    ? (meta.context_hooks as string[]).filter((h) => typeof h === 'string' && h.trim())
    : [];
  return filterCharacterContextHooks(hooks);
}

/** Prefer API copy, but never let joke/template protagonist lines through. */
export function resolveProfileTagline(
  character: Pick<Character, 'metadata' | 'summary'>,
  override?: string | null,
): string | null {
  return sanitizeProtagonistTagline(override) ?? getCharacterWittyTagline(character);
}

export function resolveProfileContextHooks(
  character: Pick<Character, 'metadata'>,
  override?: string[] | null,
): string[] {
  if (Array.isArray(override)) return filterCharacterContextHooks(override);
  return getCharacterContextHooks(character);
}

export function getMainCharacterDisplayName(
  character: Pick<Character, 'name' | 'first_name' | 'last_name' | 'metadata'>,
  user?: { user_metadata?: Record<string, unknown>; email?: string | null } | null
): string {
  return (
    getCharacterRealName(character) ||
    stripPersonNameEpithet(character.name?.trim() || '') ||
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email?.split('@')[0] ||
    'You'
  );
}

/** First-person role line for the user's own profile modal. */
export function getSelfProfileRoleTagline(role?: string | null): string {
  if (!role?.trim()) return 'Your life · at the center of your lore';
  const normalized = role.trim();
  if (/^main character$/i.test(normalized) || /^protagonist$/i.test(normalized)) {
    return 'Your life · at the center of your lore';
  }
  return normalized;
}

/** Prefer second-person copy when the stored summary reads like a character sheet. */
export function personalizeSelfSummary(summary: string | null | undefined): string {
  if (!summary?.trim()) {
    return 'Your story grows with every conversation — Lore learns about you from chat and resume.';
  }
  return summary
    .replace(/\bThe protagonist of your story\b/gi, 'You are at the center of your story')
    .replace(/\bprotagonist of your story\b/gi, 'center of your story')
    .replace(/\bYour hopes, arcs, and growth live here\.?\b/gi, 'Your hopes, arcs, and growth live here.');
}
