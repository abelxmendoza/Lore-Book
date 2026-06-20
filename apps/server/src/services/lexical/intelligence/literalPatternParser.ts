/**
 * Extract fixed literal phrase(s) from simple \b…\b preview regexes.
 * Returns null when the pattern needs full RegExp (lookbehind, classes, alternation).
 */
export type ParsedLiteral = {
  phrases: string[];
  caseInsensitive: boolean;
  wordBoundary: true;
};

function unescapeLiteralCore(source: string): string | null {
  let out = '';
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = source[i + 1];
    if (next === 's') {
      out += ' ';
      i++;
      continue;
    }
    if (next === '-' || next === "'" || next === '.') {
      out += next;
      i++;
      continue;
    }
    return null;
  }
  return out;
}

/** Expand trailing optional single character: swaps? → swap + swaps */
function expandOptionalSuffix(source: string): string[] | null {
  if (!source.endsWith('?')) return null;
  const core = source.slice(0, -1);
  if (core.length < 2) return null;
  const plural = unescapeLiteralCore(core);
  if (!plural) return null;
  const singular = unescapeLiteralCore(core.slice(0, -1));
  if (!singular) return null;
  return singular === plural ? [singular] : [singular, plural];
}

export function tryParseLiteralRegex(re: RegExp): ParsedLiteral | null {
  let source = re.source;

  if (!source.startsWith('\\b')) return null;

  source = source.slice(2);
  if (!source.endsWith('\\b')) return null;
  source = source.slice(0, -2);

  if (/\(\?|\(\?:|\[[^\]]*\]|\\d|\\w|\\W|\\S|\\D|\(\||\(\)|\+|\{|\}/.test(source)) {
    return null;
  }

  let phrases: string[] | null = null;

  if (source.endsWith('?')) {
    phrases = expandOptionalSuffix(source);
    if (!phrases) return null;
  } else {
    const phrase = unescapeLiteralCore(source);
    if (!phrase || phrase.length === 0) return null;
    phrases = [phrase];
  }

  return {
    phrases,
    caseInsensitive: re.flags.includes('i'),
    wordBoundary: true,
  };
}

export function hasWordBoundary(text: string, start: number, end: number): boolean {
  const before = start > 0 ? text[start - 1]! : ' ';
  const after = end < text.length ? text[end]! : ' ';
  return !/\w/.test(before) && !/\w/.test(after);
}
