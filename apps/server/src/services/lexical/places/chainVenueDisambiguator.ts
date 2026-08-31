/**
 * Same-brand venues at different sites (chain gyms, studios) need distinct
 * short titles from chat context — "EOS Gym — Katella & Euclid" — not
 * "EOS Fitness gym 1/2/3".
 *
 * Deterministic: no LLM. Inherit the last named brand across anaphoric
 * clauses ("the other is off State College").
 */

const TITLE_SEP = ' — ';

const BRAND_VENUE =
  /\b(?:the\s+)?((?:(?!the|a|an|is|there|theres|then|one|other|another|also)[A-Za-z][A-Za-z0-9]*)(?:\s+(?:(?!the|a|an|is)[A-Za-z][A-Za-z0-9]*)){0,2}?\s+(?:fitness(?:\s+gym)?|gym|studio|dojo|yoga))\b/i;

const BRAND_STOP = new Set([
  'the',
  'a',
  'an',
  'is',
  'there',
  'theres',
  "there's",
  'then',
  'one',
  'thats',
  "that's",
  'also',
  'other',
  'off',
  'and',
  'on',
  'in',
  'to',
  'of',
  'my',
  'our',
  'another',
]);

const ANAPHORA =
  /^(?:the\s+other(?:\s+one)?(?:\s+is)?|then\s+there'?s(?:\s+(?:one|another))?|there'?s\s+(?:also\s+)?(?:one|another)|another(?:\s+one)?(?:\s+is)?)\b/i;

const CLAUSE_SPLIT =
  /(?:\n+|(?<=\S)(?=\s+(?:the other(?:\s+one)?(?:\s+is)?\b|then\s+there'?s\b|there'?s\s+(?:also\s+)?(?:one|another)\b)))/i;

const UNCERTAIN_TAIL =
  /^(?:not sure|i don'?t know|idk|the other street|something|whatever)\b/i;

const BELIEF_PREFIX =
  /^(?:i\s+believe\s+it'?s\s+|i\s+think\s+(?:it'?s\s+)?|probably\s+|maybe\s+)/i;

const LANDMARK_FIX: Record<string, string> = {
  'barnes and nobles': 'Barnes & Noble',
  'barnes & nobles': 'Barnes & Noble',
  'barnes and noble': 'Barnes & Noble',
  'barnes & noble': 'Barnes & Noble',
};

export type ChainVenueMention = {
  brand: string;
  qualifier: string;
  displayName: string;
  evidence: string;
};

export type ParsedChainVenueTitle = {
  brand: string;
  qualifier: string | null;
  numberedSuffix: number | null;
};

export function formatChainVenueTitle(brand: string, qualifier: string): string {
  const brandLabel = displayBrand(brand);
  const siteLabel = displayQualifier(qualifier);
  if (!brandLabel || !siteLabel) return brandLabel || siteLabel;
  return `${brandLabel}${TITLE_SEP}${siteLabel}`;
}

export function parseChainVenueTitle(name: string): ParsedChainVenueTitle {
  const raw = (name ?? '').trim();
  const numbered = raw.match(/^(.*?)\s+(\d+)$/);
  let core = raw;
  let numberedSuffix: number | null = null;
  if (numbered && Number(numbered[2]) > 0 && Number(numbered[2]) < 100) {
    core = numbered[1].trim();
    numberedSuffix = Number(numbered[2]);
  }

  const sep = core.split(/\s+[—–-]\s+/);
  if (sep.length >= 2) {
    return {
      brand: normalizeBrandKey(sep[0]),
      qualifier: normalizeQualifierKey(sep.slice(1).join(' - ')),
      numberedSuffix,
    };
  }

  return {
    brand: normalizeBrandKey(core),
    qualifier: null,
    numberedSuffix,
  };
}

/** True when two cards are the same chain at different sites — do not alias-merge. */
export function sameChainDifferentSite(a: string, b: string): boolean {
  const left = parseChainVenueTitle(a);
  const right = parseChainVenueTitle(b);
  if (!left.brand || !right.brand) return false;
  if (left.brand !== right.brand && !brandsCompatible(left.brand, right.brand)) return false;

  if (left.qualifier && right.qualifier && left.qualifier !== right.qualifier) return true;
  if (
    left.numberedSuffix != null &&
    right.numberedSuffix != null &&
    left.numberedSuffix !== right.numberedSuffix
  ) {
    return true;
  }
  return false;
}

export function extractChainVenueMentions(text: string): ChainVenueMention[] {
  const clauses = splitClauses(text);
  const mentions: ChainVenueMention[] = [];
  let lastBrand: string | null = null;

  for (const clause of clauses) {
    const trimmed = clause.trim();
    if (!trimmed) continue;

    const brandRaw = findBrand(trimmed);
    const anaphoric = ANAPHORA.test(trimmed) && !brandRaw;
    const brand = brandRaw ?? (anaphoric ? lastBrand : null);
    if (!brand) continue;

    lastBrand = brandRaw ?? lastBrand;
    const qualifier = qualifierFromClause(trimmed);
    if (!qualifier) continue;

    mentions.push({
      brand: displayBrand(brand),
      qualifier: displayQualifier(qualifier),
      displayName: formatChainVenueTitle(brand, qualifier),
      evidence: trimmed,
    });
  }

  return dedupeMentions(mentions);
}

function findBrand(clause: string): string | null {
  const match = clause.match(BRAND_VENUE);
  const raw = match?.[1]?.trim();
  if (!raw) return null;
  const words = raw.split(/\s+/);
  const nameWords = words.filter((word) => !/^(?:fitness|gym|studio|dojo|yoga)$/i.test(word));
  if (nameWords.length === 0) return null;
  if (nameWords.some((word) => BRAND_STOP.has(word.toLowerCase().replace(/'/g, '')))) return null;
  return raw;
}

function splitClauses(text: string): string[] {
  return (text ?? '')
    .split(CLAUSE_SPLIT)
    .map((part) => part.trim())
    .filter(Boolean);
}

function qualifierFromClause(clause: string): string | null {
  const onAnd = clause.match(
    /\bon\s+([^,]+?)\s+and\s+([^,]+?)(?=\s+(?:the other|then\s+there|but\b)|[,.]|$)/i,
  );
  if (onAnd && !isUncertain(onAnd[2])) {
    return `${cleanCue(onAnd[1])} & ${cleanCue(onAnd[2])}`;
  }

  const onStreet = firstCue(clause, /\bon\s+([^,.]+?)(?=\s+(?:too|but|and\b|the other)|[,.]|$)/i);
  const offStreet = firstCue(
    clause,
    /\boff(?:\s+of)?\s+(?:i\s+believe\s+it'?s\s+|i\s+think\s+it'?s\s+)?([^,.]+?)(?=\s+(?:too|but|and\b|the other)|[,.]|$)/i,
  );

  if (onStreet && offStreet && !isUncertain(offStreet) && normalizeQualifierKey(onStreet) !== normalizeQualifierKey(offStreet)) {
    return `${cleanCue(onStreet)} & ${cleanCue(offStreet)}`;
  }

  if (offStreet && !isUncertain(offStreet) && !/^\s*and\s+not sure/i.test(` and ${offStreet}`)) {
    const offAnd = clause.match(
      /\boff(?:\s+of)?\s+([^,]+?)\s+and\s+([^,]+?)(?=\s+(?:the other|then\s+there|but\b)|[,.]|$)/i,
    );
    if (offAnd && !isUncertain(offAnd[2])) {
      return `${cleanCue(offAnd[1])} & ${cleanCue(offAnd[2])}`;
    }
    return cleanCue(offStreet);
  }

  if (onStreet && !isUncertain(onStreet)) return cleanCue(onStreet);

  const city = firstCue(clause, /\bin\s+([A-Za-z][A-Za-z\s]+?)(?=\s+and\b|\s+next\b|[,.]|$)/i);
  const landmark = firstCue(clause, /\b(?:next\s+to|by|near)\s+([^,.]+?)(?=\s+(?:the other|then\s+there)|[,.]|$)/i);
  if (city && landmark) return `${cleanCue(city)} (${displayQualifier(landmark)})`;
  if (landmark) return displayQualifier(landmark);
  if (city) return cleanCue(city);

  return null;
}

function firstCue(clause: string, pattern: RegExp): string | null {
  const match = clause.match(pattern);
  const value = match?.[1]?.trim() ?? '';
  if (!value || isUncertain(value)) return null;
  return value;
}

function isUncertain(value: string): boolean {
  const cleaned = cleanCue(value);
  return !cleaned || UNCERTAIN_TAIL.test(cleaned.toLowerCase());
}

function cleanCue(value: string): string {
  return value
    .replace(BELIEF_PREFIX, '')
    .replace(/\b(?:too|also)\b/gi, ' ')
    .replace(/\s+and\s+not sure\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function displayBrand(raw: string): string {
  const words = raw.trim().split(/\s+/).filter(Boolean);
  const last = words[words.length - 1]?.toLowerCase();
  if (last === 'gym' && words.some((word) => /^fitness$/i.test(word))) {
    words.pop();
  }
  return words.map(displayToken).join(' ');
}

function displayQualifier(raw: string): string {
  const fixed = LANDMARK_FIX[raw.trim().toLowerCase().replace(/\s+/g, ' ')];
  if (fixed) return fixed;
  return raw
    .split(/(\s+|&|\(|\))/)
    .map((part) => {
      if (!part.trim() || part === '&' || part === '(' || part === ')') return part;
      if (/^(?:and)$/i.test(part)) return '&';
      return displayToken(part);
    })
    .join('')
    .replace(/\s+&\s+/g, ' & ')
    .replace(/\s+/g, ' ')
    .trim();
}

function displayToken(raw: string): string {
  const trimmed = raw.trim();
  if (/^[A-Za-z]{2,4}$/.test(trimmed) && trimmed === trimmed.toUpperCase()) return trimmed.toUpperCase();
  if (/^eos$/i.test(trimmed)) return 'EOS';
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

function normalizeBrandKey(raw: string): string {
  return displayBrand(raw)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeQualifierKey(raw: string): string {
  return displayQualifier(raw)
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function brandsCompatible(a: string, b: string): boolean {
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return longer === `${shorter} gym` || longer.startsWith(`${shorter} `) || shorter.startsWith(`${longer} `);
}

function dedupeMentions(mentions: ChainVenueMention[]): ChainVenueMention[] {
  const byName = new Map<string, ChainVenueMention>();
  for (const mention of mentions) {
    const key = mention.displayName.toLowerCase();
    if (!byName.has(key)) byName.set(key, mention);
  }
  return [...byName.values()];
}

export const chainVenueDisambiguator = {
  extractChainVenueMentions,
  formatChainVenueTitle,
  parseChainVenueTitle,
  sameChainDifferentSite,
};
