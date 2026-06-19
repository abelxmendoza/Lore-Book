import type { CertifiedEntityMatch } from './certifiedEntityMatch';
import { highlightVisualClass } from './entityTypeColors';

export type EntityHighlightRange = {
  start: number;
  end: number;
  match: CertifiedEntityMatch;
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function lastToken(text: string): string {
  const trimmed = text.trimEnd();
  if (!trimmed) return '';
  return trimmed.split(/\s+/).pop() ?? '';
}

function labelsForMatch(match: CertifiedEntityMatch): string[] {
  return [...new Set([match.matchedLabel, match.name, ...match.aliases].filter((l) => l.length >= 2))].sort(
    (a, b) => b.length - a.length
  );
}

/** Prefer LoreBook knowledge over draft guesses when spans overlap. */
function matchHighlightPriority(match: CertifiedEntityMatch): number {
  if (match.status === 'draft') return 0;
  if (match.status === 'suggestion') return 1;
  return 2;
}

/** Prefer higher-confidence matches; drop overlaps so highlights stay readable. */
export function mergeNonOverlappingRanges(ranges: EntityHighlightRange[]): EntityHighlightRange[] {
  if (ranges.length <= 1) return ranges;

  const sorted = [...ranges].sort((a, b) => {
    const priority = matchHighlightPriority(b.match) - matchHighlightPriority(a.match);
    if (priority !== 0) return priority;
    const lenDiff = b.end - b.start - (a.end - a.start);
    if (lenDiff !== 0) return lenDiff;
    if (a.start !== b.start) return a.start - b.start;
    return 0;
  });

  const merged: EntityHighlightRange[] = [];

  for (const range of sorted) {
    if (range.start >= range.end) continue;
    const overlaps = merged.some(
      (kept) => range.start < kept.end && range.end > kept.start
    );
    if (!overlaps) merged.push(range);
  }

  return merged.sort((a, b) => a.start - b.start);
}

/** Find text spans to highlight from current composer entity matches. */
export function findEntityHighlightRanges(
  text: string,
  matches: CertifiedEntityMatch[]
): EntityHighlightRange[] {
  if (!text || matches.length === 0) return [];

  const ranges: EntityHighlightRange[] = [];
  const seenSpan = new Set<string>();

  const pushRange = (start: number, end: number, match: CertifiedEntityMatch) => {
    if (start < 0 || end <= start || end > text.length) return;
    const key = `${start}:${end}`;
    if (seenSpan.has(key)) return;
    seenSpan.add(key);
    ranges.push({ start, end, match });
  };

  for (const match of matches) {
    if (match.matchKind === 'prefix') {
      const token = lastToken(text);
      if (token.length >= 2) {
        const idx = text.lastIndexOf(token);
        if (idx >= 0) pushRange(idx, idx + token.length, match);
      }
      continue;
    }

    for (const label of labelsForMatch(match)) {
      const pattern = new RegExp(`(?<![a-z0-9])${escapeRe(label)}(?![a-z0-9])`, 'gi');
      let hit: RegExpExecArray | null;
      while ((hit = pattern.exec(text)) !== null) {
        pushRange(hit.index, hit.index + hit[0].length, match);
      }
    }
  }

  return mergeNonOverlappingRanges(ranges);
}

export function highlightClassForMatch(match: CertifiedEntityMatch): string {
  return highlightVisualClass(match);
}
