import { normalizeNameKey } from '../../utils/nameNormalization';

/** Alias tails / vibes concepts that should fold into a canon place, not stay as cards. */
export function resolvePlaceAliasTarget(name: string): string | null {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return null;

  const vibes = trimmed.match(/^(.+?)\s+vibes$/i);
  if (vibes?.[1]) return vibes[1].trim();

  const theClub = trimmed.match(/^(.+?)\s+the\s+(?:club|venue|bar|spot)$/i);
  if (theClub?.[1]) return theClub[1].trim();

  return null;
}

export function aliasKeysForPlace(canonical: string, aliases: string[] = []): Set<string> {
  return new Set([canonical, ...aliases].map((name) => normalizeNameKey(name)).filter(Boolean));
}
