/** Shared preview / intelligence pattern definitions. */

export type PreviewPattern = {
  id: string;
  type: string;
  subtype?: string;
  /** Fixed phrase matched via Aho–Corasick (case-insensitive unless caseSensitive). */
  literal?: string;
  /** Additional fixed phrases (e.g. plural forms). */
  literalVariants?: string[];
  /** Dynamic pattern — lookbehind, classes, alternation. */
  regex?: RegExp;
  colorKey: string;
  confidenceBase: number;
  requiresReview?: boolean;
  priority: number;
  contextRules?: string[];
  caseSensitive?: boolean;
};

export function validatePreviewPattern(pattern: PreviewPattern): void {
  if (!pattern.id?.trim()) throw new Error('PreviewPattern requires id');
  if (!pattern.literal && !pattern.regex) {
    throw new Error(`PreviewPattern "${pattern.id}" requires literal or regex`);
  }
  if (pattern.literal && pattern.regex) {
    throw new Error(`PreviewPattern "${pattern.id}" must use literal or regex, not both`);
  }
}

export function literalPhrases(pattern: PreviewPattern): string[] {
  if (!pattern.literal) return [];
  const variants = pattern.literalVariants ?? [];
  return [pattern.literal, ...variants.filter((v) => v !== pattern.literal)];
}

export function patternConfidence(pattern: PreviewPattern): number {
  return pattern.confidenceBase;
}

export function patternNeedsReview(pattern: PreviewPattern): boolean | undefined {
  return pattern.requiresReview;
}

/** @deprecated use regex — legacy accessor for gradual migration */
export function patternRegex(pattern: PreviewPattern): RegExp | undefined {
  return pattern.regex;
}

export type PatternTextMatch = {
  start: number;
  end: number;
  text: string;
};

export function matchPreviewPattern(text: string, pattern: PreviewPattern): PatternTextMatch[] {
  const out: PatternTextMatch[] = [];

  if (pattern.literal) {
    const phrases = literalPhrases(pattern);
    const ci = !pattern.caseSensitive;
    for (const phrase of phrases) {
      let from = 0;
      while (from <= text.length) {
        const idx = ci
          ? text.toLowerCase().indexOf(phrase.toLowerCase(), from)
          : text.indexOf(phrase, from);
        if (idx < 0) break;
        const end = idx + phrase.length;
        if (hasWordBoundary(text, idx, end)) {
          out.push({ start: idx, end, text: text.slice(idx, end) });
        }
        from = idx + 1;
      }
    }
    return dedupeMatches(out);
  }

  if (pattern.regex) {
    pattern.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.regex.exec(text)) !== null) {
      out.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
    }
  }

  return out;
}

function dedupeMatches(matches: PatternTextMatch[]): PatternTextMatch[] {
  const seen = new Set<string>();
  return matches.filter((m) => {
    const key = `${m.start}:${m.end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function hasWordBoundary(text: string, start: number, end: number): boolean {
  const before = start > 0 ? text[start - 1]! : ' ';
  const after = end < text.length ? text[end]! : ' ';
  return !/\w/.test(before) && !/\w/.test(after);
}
