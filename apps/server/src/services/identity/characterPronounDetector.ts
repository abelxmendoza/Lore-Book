/**
 * Bind third-person pronouns / gendered roles in chat to a named character.
 *
 * Explicit slash-forms ("Jamie's pronouns are she/her") win. Otherwise we
 * only infer when gendered tokens are bound to that person — never from
 * who they date, and never when two people share the sentence.
 */

export const CANONICAL_PRONOUNS = [
  'she/her',
  'he/him',
  'they/them',
  'she/they',
  'he/they',
  'it/its',
] as const;

export type CanonicalPronouns = (typeof CANONICAL_PRONOUNS)[number];

export type PronounEvidenceSource = 'explicit' | 'role_noun' | 'bound_pronoun';

export type CharacterPronounDetection = {
  pronouns: CanonicalPronouns;
  confidence: number;
  source: PronounEvidenceSource;
  evidence: string[];
};

export type DetectCharacterPronounsInput = {
  name: string;
  aliases?: string[];
  /** Chip/modal focus: 3rd-person pronouns bind even if the name is not repeated. */
  focused?: boolean;
};

type GenderBucket = 'she' | 'he' | 'they' | 'it';

const EXPLICIT_SET_RE =
  /\b(he\/him|she\/her|they\/them|he\/they|she\/they|it\/its|xe\/xem|ze\/hir)\b/i;

const SHE_PRONOUNS = new Set(['she', 'her', 'hers', 'herself', 'ella']);
const HE_PRONOUNS = new Set(['he', 'him', 'his', 'himself', 'él']);
const THEY_PRONOUNS = new Set(['they', 'them', 'their', 'theirs', 'themself', 'themselves']);
const IT_PRONOUNS = new Set(['it', 'its', 'itself']);

const TOKEN_RE = /\b(she|her|hers|herself|he|him|his|himself|they|them|their|theirs|themself|themselves|it|its|itself|ella|él)\b/gi;

const SHE_ROLES =
  'girlfriend|wife|fianc[eé]e|mom|mother|mama|mum|aunt|t[ií]a|sister(?:-in-law)?|daughter|niece|grandma|grandmother|abuela|girl|woman|lady|female|queen';
const HE_ROLES =
  'boyfriend|husband|fianc[eé]|dad|father|papa|uncle|t[ií]o|brother(?:-in-law)?|son|nephew|grandpa|grandfather|abuelo|guy|man|dude|boy|male|king';
const THEY_ROLES = 'non[- ]?binary|enby|genderqueer|agender';

const RELATIVE_AFTER_POSSESSIVE =
  /\b(sister|brother|mom|mother|dad|father|aunt|uncle|friend|girlfriend|boyfriend|wife|husband|partner|cousin|daughter|son|niece|nephew)\b/i;

const OTHER_PERSON_RE = /\b[A-ZÁÉÍÓÚÑ][\p{L}'’.-]{1,40}(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}'’.-]{1,40}){0,3}\b/gu;

const NAME_TITLES = new Set([
  'tia', 'tía', 'tio', 'tío', 'aunt', 'uncle', 'mr', 'mrs', 'ms', 'dr',
  'grandma', 'grandpa', 'abuela', 'abuelo',
]);

const STOP_PERSON_TOKENS = new Set([
  'she', 'he', 'they', 'her', 'his', 'their', 'it', 'the', 'a', 'an', 'my',
  'i', 'we', 'you', 'me', 'us', 'this', 'that', 'these', 'those', 'and', 'but',
  'about', 'then', 'when', 'after', 'before', 'today', 'yesterday', 'monday',
]);

const QUESTION = /^(?:is|are|does|do|was|were|who|what)\b/i;
const NEGATION = /\b(?:not|never|isn't|is not|aren't|are not|doesn't|does not)\b/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizePronounSet(raw: string): CanonicalPronouns | null {
  const key = raw.toLowerCase().replace(/\s+/g, '');
  if (key === 'xe/xem' || key === 'ze/hir') return 'they/them';
  return (CANONICAL_PRONOUNS as readonly string[]).includes(key)
    ? (key as CanonicalPronouns)
    : null;
}

function bucketForToken(token: string): GenderBucket | null {
  const key = token.toLowerCase();
  if (SHE_PRONOUNS.has(key)) return 'she';
  if (HE_PRONOUNS.has(key)) return 'he';
  if (THEY_PRONOUNS.has(key)) return 'they';
  if (IT_PRONOUNS.has(key)) return 'it';
  return null;
}

function pronounsForBucket(bucket: GenderBucket): CanonicalPronouns {
  if (bucket === 'she') return 'she/her';
  if (bucket === 'he') return 'he/him';
  if (bucket === 'they') return 'they/them';
  return 'it/its';
}

function splitSentences(text: string): string[] {
  return text
    .replace(/[‘’ʼ]/g, "'")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function subjectKeys(name: string, aliases: string[] = []): string[] {
  const keys = new Set<string>();
  const add = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    keys.add(trimmed.toLowerCase());
    const parts = trimmed.split(/\s+/);
    if (parts.length > 1 && !NAME_TITLES.has(parts[0].toLowerCase()) && parts[0].length >= 3) {
      keys.add(parts[0].toLowerCase());
    }
    if (parts.length > 1 && NAME_TITLES.has(parts[0].toLowerCase()) && parts[1]) {
      keys.add(parts.slice(1).join(' ').toLowerCase());
    }
  };
  add(name);
  for (const alias of aliases) add(alias);
  return [...keys].sort((a, b) => b.length - a.length);
}

function namePattern(keys: string[]): RegExp {
  const inner = keys.map(escapeRegExp).join('|');
  return new RegExp(`\\b(?:${inner})\\b`, 'i');
}

function sentenceMentionsSubject(sentence: string, keys: string[]): boolean {
  return namePattern(keys).test(sentence);
}

function otherNamedPeople(sentence: string, keys: string[]): string[] {
  const subjectRe = namePattern(keys);
  const found: string[] = [];
  OTHER_PERSON_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  const copy = sentence;
  const re = new RegExp(OTHER_PERSON_RE.source, OTHER_PERSON_RE.flags);
  while ((match = re.exec(copy)) !== null) {
    const token = match[0];
    if (subjectRe.test(token)) continue;
    if (NAME_TITLES.has(token.toLowerCase())) continue;
    if (STOP_PERSON_TOKENS.has(token.toLowerCase())) continue;
    if (/^(I|I'm|I've|I'll|I'd)$/i.test(token)) continue;
    found.push(token);
  }
  return found;
}

function isPluralTheyContext(sentence: string, keys: string[]): boolean {
  if (/\bthey (?:both|all)\b/i.test(sentence)) return true;
  if (namePattern(keys).test(sentence) && /\band\s+[A-ZÁÉÍÓÚÑ]/.test(sentence)) return true;
  return otherNamedPeople(sentence, keys).length > 0 && /\bthey\b/i.test(sentence);
}

function possessiveRelativeBlocksPronoun(sentence: string, keys: string[]): boolean {
  const re = new RegExp(
    `\\b(?:${keys.map(escapeRegExp).join('|')})'s\\s+${RELATIVE_AFTER_POSSESSIVE.source}`,
    'i',
  );
  return re.test(sentence);
}

function herIsSomeoneElse(sentence: string, keys: string[]): boolean {
  return new RegExp(
    `\\b(?:her|his|their)\\s+(?:${RELATIVE_AFTER_POSSESSIVE.source.replace(/\\b/g, '')})\\s+(?:${keys.map(escapeRegExp).join('|')})\\b`,
    'i',
  ).test(sentence);
}

function detectExplicit(text: string, keys: string[], focused: boolean): CharacterPronounDetection | null {
  for (const sentence of splitSentences(text)) {
    if (sentence.endsWith('?') || QUESTION.test(sentence) || NEGATION.test(sentence)) continue;
    const mentions = sentenceMentionsSubject(sentence, keys) || focused;
    if (!mentions) continue;

    const namedSet = sentence.match(
      new RegExp(
        `\\b(?:${keys.map(escapeRegExp).join('|')})(?:'s)?\\s+(?:pronouns?\\s+(?:are|is)|uses|goes by)\\s+${EXPLICIT_SET_RE.source}`,
        'i',
      ),
    );
    const focusedSet = focused
      ? sentence.match(
          new RegExp(
            `\\b(?:their|her|his)\\s+pronouns\\s+(?:are|is)\\s+${EXPLICIT_SET_RE.source}`,
            'i',
          ),
        )
      : null;
    const slashOnly = mentions
      ? sentence.match(
          new RegExp(
            `\\b(?:${keys.map(escapeRegExp).join('|')})\\s+is\\s+${EXPLICIT_SET_RE.source}`,
            'i',
          ),
        )
      : null;

    const hit = namedSet?.[1] ?? focusedSet?.[1] ?? slashOnly?.[1];
    const canonical = hit ? normalizePronounSet(hit) : null;
    if (canonical) {
      return {
        pronouns: canonical,
        confidence: 0.97,
        source: 'explicit',
        evidence: [sentence],
      };
    }
  }
  return null;
}

function detectRoleNoun(text: string, keys: string[]): CharacterPronounDetection | null {
  const nameAlt = keys.map(escapeRegExp).join('|');
  const sheRe = new RegExp(
    `\\b(?:${nameAlt})\\b[^.!?]{0,36}\\b(?:is|was|'s)\\s+(?:my|a|an)\\s+(?:${SHE_ROLES})\\b`,
    'i',
  );
  const heRe = new RegExp(
    `\\b(?:${nameAlt})\\b[^.!?]{0,36}\\b(?:is|was|'s)\\s+(?:my|a|an)\\s+(?:${HE_ROLES})\\b`,
    'i',
  );
  const theyRe = new RegExp(
    `\\b(?:${nameAlt})\\b[^.!?]{0,36}\\b(?:is|was|'s)\\s+(?:my|a|an)?\\s*(?:${THEY_ROLES})\\b`,
    'i',
  );
  const sheLead = new RegExp(`\\b(?:my|a|an)\\s+(?:${SHE_ROLES})\\s+(?:named\\s+)?(?:${nameAlt})\\b`, 'i');
  const heLead = new RegExp(`\\b(?:my|a|an)\\s+(?:${HE_ROLES})\\s+(?:named\\s+)?(?:${nameAlt})\\b`, 'i');

  for (const sentence of splitSentences(text)) {
    if (sentence.endsWith('?') || QUESTION.test(sentence) || NEGATION.test(sentence)) continue;
    if (theyRe.test(sentence)) {
      return { pronouns: 'they/them', confidence: 0.92, source: 'role_noun', evidence: [sentence] };
    }
    if (sheRe.test(sentence) || sheLead.test(sentence)) {
      return { pronouns: 'she/her', confidence: 0.9, source: 'role_noun', evidence: [sentence] };
    }
    if (heRe.test(sentence) || heLead.test(sentence)) {
      return { pronouns: 'he/him', confidence: 0.9, source: 'role_noun', evidence: [sentence] };
    }
  }
  return null;
}

function collectBoundBuckets(
  text: string,
  keys: string[],
  focused: boolean,
): { counts: Record<GenderBucket, number>; evidence: string[] } {
  const counts: Record<GenderBucket, number> = { she: 0, he: 0, they: 0, it: 0 };
  const evidence: string[] = [];
  let pendingAnaphora = false;

  const scoreSentence = (sentence: string, nearbyOnly: boolean) => {
    const window = nearbyOnly
      ? (() => {
          const idx = sentence.search(namePattern(keys));
          return idx >= 0 ? sentence.slice(idx, idx + 90) : '';
        })()
      : sentence;
    if (!window) return;
    const local = new RegExp(TOKEN_RE.source, TOKEN_RE.flags);
    let token: RegExpExecArray | null;
    let scored = false;
    while ((token = local.exec(window)) !== null) {
      const bucket = bucketForToken(token[1]);
      if (!bucket) continue;
      if (bucket === 'they' && isPluralTheyContext(sentence, keys)) continue;
      counts[bucket] += 1;
      scored = true;
    }
    if (scored) evidence.push(sentence);
  };

  for (const sentence of splitSentences(text)) {
    const mentionsSubject = sentenceMentionsSubject(sentence, keys);
    const others = otherNamedPeople(sentence, keys);

    if (sentence.endsWith('?') || QUESTION.test(sentence)) {
      pendingAnaphora = mentionsSubject && others.length === 0;
      continue;
    }
    if (possessiveRelativeBlocksPronoun(sentence, keys) || herIsSomeoneElse(sentence, keys)) {
      pendingAnaphora = mentionsSubject && others.length === 0;
      continue;
    }

    if (focused && !mentionsSubject) {
      if (!sentence.endsWith('?') && !QUESTION.test(sentence) && !herIsSomeoneElse(sentence, keys)) {
        scoreSentence(sentence, false);
      }
      pendingAnaphora = others.length === 0;
      continue;
    }

    if (mentionsSubject && others.length === 0) {
      scoreSentence(sentence, false);
      pendingAnaphora = true;
      continue;
    }
    if (mentionsSubject && others.length > 0) {
      scoreSentence(sentence, true);
      pendingAnaphora = false;
      continue;
    }
    if ((focused || pendingAnaphora) && others.length === 0) {
      scoreSentence(sentence, false);
      pendingAnaphora = focused || pendingAnaphora;
      continue;
    }
    pendingAnaphora = false;
  }

  return { counts, evidence };
}

function aboutPrefixFocus(text: string, keys: string[]): { focused: boolean; body: string } {
  const match = text.match(/^About\s+(.+?):\s*/i);
  if (!match) return { focused: false, body: text };
  const aboutName = match[1].trim().toLowerCase();
  if (keys.some((key) => aboutName === key || aboutName.startsWith(`${key} `) || aboutName.endsWith(` ${key}`))) {
    return { focused: true, body: text.slice(match[0].length) };
  }
  return { focused: false, body: text };
}

export function detectCharacterPronouns(
  text: string,
  input: DetectCharacterPronounsInput,
): CharacterPronounDetection | null {
  const name = input.name?.trim();
  if (!name || !text.trim()) return null;

  const keys = subjectKeys(name, input.aliases);
  if (keys.length === 0) return null;

  const prefixed = aboutPrefixFocus(text, keys);
  const focused = Boolean(input.focused || prefixed.focused);
  const body = prefixed.body;

  const explicit = detectExplicit(text, keys, focused);
  if (explicit) return explicit;

  const role = detectRoleNoun(text, keys);
  if (role) return role;

  const { counts, evidence } = collectBoundBuckets(body, keys, focused);
  const she = counts.she;
  const he = counts.he;
  const they = counts.they;
  const it = counts.it;

  if (she > 0 && he > 0) return null;

  if (she > 0 && she >= he && she >= they) {
    const min = focused ? 1 : 2;
    if (she >= min || (she >= 1 && sentenceMentionsSubject(text, keys))) {
      return {
        pronouns: pronounsForBucket('she'),
        confidence: she >= 2 ? 0.88 : 0.74,
        source: 'bound_pronoun',
        evidence,
      };
    }
  }

  if (he > 0 && he >= she && he >= they) {
    const min = focused ? 1 : 2;
    if (he >= min || (he >= 1 && sentenceMentionsSubject(text, keys))) {
      return {
        pronouns: pronounsForBucket('he'),
        confidence: he >= 2 ? 0.88 : 0.74,
        source: 'bound_pronoun',
        evidence,
      };
    }
  }

  if (they >= 2 && she === 0 && he === 0 && !isPluralTheyContext(text, keys)) {
    return {
      pronouns: pronounsForBucket('they'),
      confidence: 0.78,
      source: 'bound_pronoun',
      evidence,
    };
  }

  if (it >= 2 && she === 0 && he === 0 && they === 0) {
    return {
      pronouns: pronounsForBucket('it'),
      confidence: 0.7,
      source: 'bound_pronoun',
      evidence,
    };
  }

  return null;
}
