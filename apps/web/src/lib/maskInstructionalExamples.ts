/**
 * Instructional e.g. "…" quotes in composer prefills must not spawn entity chips.
 * Example: `say it plainly (e.g. "actually her name is Maya" or "…")` — Maya is not a mention.
 */

export type TextRange = { start: number; end: number };

/** Ranges of `(e.g. "…" or "…")` / `(e.g. '…')` instructional examples. */
export function findInstructionalExampleRanges(text: string): TextRange[] {
  if (!text) return [];
  const ranges: TextRange[] = [];
  const pattern =
    /\(e\.g\.\s*(?:"[^"]*"|'[^']*')(?:\s*or\s*(?:"[^"]*"|'[^']*'))*\)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges;
}

/** True when [start, end) lies fully inside an instructional example range. */
export function rangeInsideInstructionalExample(
  start: number,
  end: number,
  ranges: TextRange[],
): boolean {
  if (end <= start) return false;
  return ranges.some((r) => start >= r.start && end <= r.end);
}

/**
 * Replace instructional example segments with spaces (same length) so
 * entity matchers keep offsets aligned with the visible composer text.
 */
export function maskInstructionalExamples(text: string): string {
  const ranges = findInstructionalExampleRanges(text);
  if (ranges.length === 0) return text;
  const chars = text.split('');
  for (const { start, end } of ranges) {
    for (let i = start; i < end; i++) {
      chars[i] = chars[i] === '\n' ? '\n' : ' ';
    }
  }
  return chars.join('');
}
