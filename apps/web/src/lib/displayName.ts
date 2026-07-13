/**
 * Identity-safe display names.
 *
 * Shortening a name to its first word is only safe when that word is a real
 * given name. Two classes of names must NEVER be split:
 *  - title-led names: "Tio Ralph" → "Tio" (a bare honorific means nobody),
 *  - stage/persona names: "Hell Fairy" → "Hell" (half a nickname is noise).
 *
 * The failure mode of showing the FULL name is harmless, so we shorten only
 * when confident and fall back to the full name everywhere else.
 */

const TITLE_WORDS = new Set([
  'mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'prof', 'professor', 'coach',
  'pastor', 'father', 'sister', 'brother', 'sir', 'madam', 'madame',
  'don', 'dona', 'doña', 'sr', 'sra', 'srta', 'senor', 'señor', 'senora', 'señora',
  'tio', 'tío', 'tia', 'tía', 'uncle', 'aunt', 'auntie',
  'abuela', 'abuelo', 'grandma', 'grandpa', 'grandmother', 'grandfather',
  'mom', 'mother', 'mama', 'dad', 'papa', 'primo', 'prima', 'cousin',
  'stepmom', 'stepdad', 'stepmother', 'stepfather',
]);

/** Words that mark a stage/persona name — never split these names. */
const STAGE_WORD_RE =
  /\b(fairy|queen|king|goth|moth|neon|doll|dolls|vex|bat|bats|dj|mc|baby|hell|shadow|ghost|pixie|kitten|kitty|bunny|angel|demon|witch|wolf|fox|raven|storm|blaze|nova)\b/i;

function stripDot(token: string): string {
  return token.replace(/\.+$/, '').toLowerCase();
}

/** True when the whole name is just a title/honorific ("Mr", "Tio", "Dr."). */
export function isBareTitleName(name: string | null | undefined): boolean {
  const tokens = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every((t) => TITLE_WORDS.has(stripDot(t)));
}

/**
 * Short form for tight UI (chips, possessives, avatars' labels).
 * - "John Smith"  → "John"
 * - "Tio Ralph"   → "Tio Ralph"   (title needs its name)
 * - "Hell Fairy"  → "Hell Fairy"  (stage names stay whole)
 * - "Dr. Amy Wu"  → "Dr. Amy"     (title + given name)
 * - "Mr"          → "Mr"          (nothing better to show — see isBareTitleName)
 */
export function shortDisplayName(name: string | null | undefined): string {
  const clean = (name ?? '').trim();
  if (!clean) return '';
  const tokens = clean.split(/\s+/);
  if (tokens.length === 1) return clean;
  if (STAGE_WORD_RE.test(clean)) return clean;

  const first = stripDot(tokens[0]);
  if (TITLE_WORDS.has(first)) {
    // Keep the title attached to the first real name token.
    return tokens.slice(0, 2).join(' ');
  }
  return tokens[0];
}

/** Possessive form built on the safe short name ("Hell Fairy's", "Tio Ralph's"). */
export function shortPossessive(name: string | null | undefined): string {
  const short = shortDisplayName(name);
  if (!short) return '';
  return /s$/i.test(short) ? `${short}'` : `${short}'s`;
}
