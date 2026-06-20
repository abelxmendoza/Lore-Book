/**
 * Collapse character composer matches when a shorter name is only mentioned
 * as part of a longer person name in the same text (e.g. drop "Mendoza" when
 * "Abel Mendoza" is already matched).
 */

import type { CertifiedEntityMatch } from './certifiedEntityMatch';

function normalizeNameKey(name: string): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function labelsForMatch(match: CertifiedEntityMatch): string[] {
  return [...new Set([match.matchedLabel, match.name, ...match.aliases].filter((l) => l.length >= 2))].sort(
    (a, b) => b.length - a.length
  );
}

type TextSpan = { start: number; end: number; match: CertifiedEntityMatch; label: string };

function findCharacterSpans(text: string, match: CertifiedEntityMatch): TextSpan[] {
  const spans: TextSpan[] = [];
  for (const label of labelsForMatch(match)) {
    const pattern = new RegExp(`(?<![a-z0-9])${escapeRe(label)}(?![a-z0-9])`, 'gi');
    let hit: RegExpExecArray | null;
    while ((hit = pattern.exec(text)) !== null) {
      spans.push({
        start: hit.index,
        end: hit.index + hit[0].length,
        match,
        label,
      });
    }
  }
  return spans;
}

function spanContains(outer: TextSpan, inner: TextSpan): boolean {
  return outer.start <= inner.start && outer.end >= inner.end && (outer.start < inner.start || outer.end > inner.end);
}

/** Drop surname-only / partial person chips subsumed by a longer person mention in text. */
export function collapseOverlappingPersonComposerMatches(
  text: string,
  matches: CertifiedEntityMatch[]
): CertifiedEntityMatch[] {
  if (!text.trim() || matches.length <= 1) return matches;

  const characters = matches.filter((m) => m.type === 'character');
  if (characters.length <= 1) return matches;

  const allSpans = characters.flatMap((m) => findCharacterSpans(text, m));
  if (allSpans.length === 0) return matches;

  const dropSlots = new Set<string>();

  for (const short of allSpans) {
    for (const long of allSpans) {
      if (short.match.id === long.match.id) continue;
      if (long.label.length <= short.label.length) continue;
      if (!spanContains(long, short)) continue;
      dropSlots.add(`${short.match.type}:${short.match.id}`);
      break;
    }
  }

  if (dropSlots.size === 0) return matches;
  return matches.filter((m) => !dropSlots.has(`${m.type}:${m.id}`));
}

/** Extend covered keys with name tokens when a multi-word person name is already matched in text. */
export function coveredKeysFromPersonMatchesInText(
  text: string,
  matches: CertifiedEntityMatch[]
): Set<string> {
  const covered = new Set<string>();
  for (const match of matches) {
    if (match.type !== 'character') continue;
    for (const label of labelsForMatch(match)) {
      const pattern = new RegExp(`(?<![a-z0-9])${escapeRe(label)}(?![a-z0-9])`, 'i');
      if (!pattern.test(text)) continue;
      const key = normalizeNameKey(label);
      if (key) covered.add(key);
      const tokens = label.split(/\s+/).filter(Boolean);
      if (tokens.length >= 2) {
        for (const token of tokens) {
          const tokenKey = normalizeNameKey(token);
          if (tokenKey.length >= 2) covered.add(tokenKey);
        }
      }
    }
  }
  return covered;
}
