/**
 * Title-Only Entity Guard — lexical layer
 *
 * A title, honorific, role, rank, relationship label, or generic descriptor
 * cannot become a PERSON entity by itself. It must have a name attached, resolve
 * to canon, or remain an unresolved reference.
 */

export type PersonReferenceType =
  | 'TITLE_REFERENCE'
  | 'ROLE_REFERENCE'
  | 'FAMILY_REFERENCE'
  | 'UNRESOLVED_PERSON_REFERENCE';

export type TitleOnlyGuardResult = {
  isTitleOnly: boolean;
  referenceType?: PersonReferenceType;
  displayName: string;
  needsResolution: boolean;
  /** True when a title/honorific prefix is followed by a name token */
  hasAttachedName: boolean;
  attachedName?: string;
};

const norm = (s: string) =>
  (s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/[.]/g, '')
    .replace(/\s+/g, ' ');

/** Multi-word title-only phrases (longest match first at parse time). */
const MULTI_WORD_TITLE_ONLY: Array<{ phrase: string; type: PersonReferenceType }> = [
  { phrase: 'vice president', type: 'TITLE_REFERENCE' },
  { phrase: 'best friend', type: 'UNRESOLVED_PERSON_REFERENCE' },
  { phrase: 'co founder', type: 'TITLE_REFERENCE' },
  { phrase: 'co-founder', type: 'TITLE_REFERENCE' },
  { phrase: 'step dad', type: 'FAMILY_REFERENCE' },
  { phrase: 'step mom', type: 'FAMILY_REFERENCE' },
  { phrase: 'step father', type: 'FAMILY_REFERENCE' },
  { phrase: 'step mother', type: 'FAMILY_REFERENCE' },
].sort((a, b) => b.phrase.length - a.phrase.length);

const TOKEN_CATEGORY = new Map<string, PersonReferenceType>();

function reg(tokens: string[], type: PersonReferenceType): void {
  for (const t of tokens) TOKEN_CATEGORY.set(norm(t), type);
}

reg(
  [
    'mr', 'mrs', 'ms', 'miss', 'dr', 'doctor', 'professor', 'prof', 'coach', 'pastor', 'father', 'sister',
    'brother', 'officer', 'deputy', 'detective', 'sheriff', 'captain', 'commander', 'general', 'colonel',
    'major', 'lieutenant', 'sergeant', 'president', 'governor', 'mayor', 'senator', 'representative',
    'judge', 'justice', 'superintendent', 'principal', 'dean', 'teacher', 'instructor', 'ceo', 'cto', 'cfo',
    'founder', 'owner', 'sir', 'madam', 'maam', "ma'am", 'rev', 'reverend',
  ],
  'TITLE_REFERENCE'
);

reg(
  [
    'manager', 'director', 'supervisor', 'recruiter', 'promoter', 'dj', 'bartender', 'photographer',
    'engineer', 'technician', 'developer', 'programmer', 'designer', 'lawyer', 'attorney', 'nurse',
    'therapist', 'dentist', 'veterinarian', 'mechanic', 'plumber', 'electrician', 'landlord', 'boss',
    'bouncer', 'barista', 'waiter', 'waitress', 'server', 'driver', 'trainer', 'mentor', 'therapist',
    'cashier', 'interviewer', 'dealer', 'organizer', 'admirer', 'guardian',
  ],
  'ROLE_REFERENCE'
);

reg(
  [
    'uncle', 'aunt', 'auntie', 'tio', 'tia', 'tía', 'tío', 'primo', 'prima', 'cousin', 'dad', 'mom',
    'mother', 'mama', 'mamá', 'mommy', 'father', 'papa', 'papá', 'daddy', 'grandma', 'grandpa',
    'abuela', 'abuelo', 'stepdad', 'stepmom', 'stepfather', 'stepmother', 'nana', 'godmother', 'godfather',
    'roommate', 'boyfriend', 'girlfriend', 'husband', 'wife', 'partner', 'bro', 'sis',
  ],
  'FAMILY_REFERENCE'
);

reg(
  [
    'friend', 'homie', 'dude', 'guy', 'girl', 'woman', 'man', 'kid', 'child', 'student', 'coworker',
    'colleague', 'classmate', 'bandmate', 'teammate', 'neighbor', 'neighbour', 'stranger', 'someone',
    'somebody', 'buddy', 'pal', 'ex', 'crush', 'date', 'client', 'customer', 'peer',
  ],
  'UNRESOLVED_PERSON_REFERENCE'
);

/** Prefix titles that may lead a valid PERSON when followed by a name. */
const PREFIX_TITLES = new Set([
  ...TOKEN_CATEGORY.keys(),
  'mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'professor', 'coach', 'pastor', 'tio', 'tia', 'tía', 'tío',
  'uncle', 'aunt', 'abuela', 'abuelo', 'grandma', 'grandpa', 'principal', 'officer', 'captain', 'mayor',
  'president', 'senator', 'judge', 'dean', 'dj', 'doctor', 'sir',
]);

const NAME_TOKEN_RE = /^[A-ZÀ-Ý][\w''-]+$/;
const GENERIC_NAME_BLOCK = new Set(['the', 'a', 'an', 'my', 'our', 'your', 'his', 'her', 'their']);

export function titleOnlyTokenCategory(token: string): PersonReferenceType | undefined {
  return TOKEN_CATEGORY.get(norm(token));
}

export function isTitleOnlyToken(token: string): boolean {
  return TOKEN_CATEGORY.has(norm(token));
}

function referenceTypeForPhrase(phrase: string): PersonReferenceType {
  const key = norm(phrase);
  for (const entry of MULTI_WORD_TITLE_ONLY) {
    if (key === norm(entry.phrase)) return entry.type;
  }
  const tokens = key.split(' ').filter(Boolean);
  if (tokens.length === 1) {
    return TOKEN_CATEGORY.get(tokens[0]!) ?? 'UNRESOLVED_PERSON_REFERENCE';
  }
  if (tokens.every((t) => TOKEN_CATEGORY.has(t))) return 'ROLE_REFERENCE';
  return 'UNRESOLVED_PERSON_REFERENCE';
}

function looksLikeNameToken(token: string): boolean {
  const n = token.trim();
  if (!n || GENERIC_NAME_BLOCK.has(norm(n))) return false;
  if (isTitleOnlyToken(n)) return false;
  if (NAME_TOKEN_RE.test(n)) return true;
  if (/^[A-Z]/.test(n) && n.length >= 2 && !isTitleOnlyToken(n)) return true;
  return false;
}

export function parsePersonSurface(text: string): TitleOnlyGuardResult {
  const raw = (text ?? '').trim();
  const displayName = raw;
  if (!raw) {
    return { isTitleOnly: true, displayName: '', needsResolution: true, hasAttachedName: false };
  }

  const key = norm(raw);

  for (const entry of MULTI_WORD_TITLE_ONLY) {
    const prefix = norm(entry.phrase);
    if (key === prefix) {
      return {
        isTitleOnly: true,
        referenceType: entry.type,
        displayName,
        needsResolution: true,
        hasAttachedName: false,
      };
    }
    if (key.startsWith(`${prefix} `)) {
      const rest = raw.slice(entry.phrase.length).trim();
      if (looksLikeNameToken(rest.split(/\s+/)[0] ?? '')) {
        return {
          isTitleOnly: false,
          displayName,
          needsResolution: false,
          hasAttachedName: true,
          attachedName: rest,
        };
      }
    }
  }

  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) {
    const cat = TOKEN_CATEGORY.get(norm(tokens[0]!));
    if (cat) {
      return {
        isTitleOnly: true,
        referenceType: cat,
        displayName,
        needsResolution: true,
        hasAttachedName: false,
      };
    }
    return {
      isTitleOnly: false,
      displayName,
      needsResolution: false,
      hasAttachedName: false,
    };
  }

  // Title + name: "Professor Kim", "Mr. Morten", "Tio Ralph", "DJ Shadow"
  let prefixLen = 0;
  let prefixTokens = 0;
  for (let i = 1; i <= Math.min(3, tokens.length - 1); i++) {
    const prefix = tokens.slice(0, i).join(' ');
    const prefixKey = norm(prefix);
    if (PREFIX_TITLES.has(prefixKey) || TOKEN_CATEGORY.has(prefixKey.split(' ')[0]!)) {
      prefixLen = i;
      prefixTokens = i;
    }
    if (MULTI_WORD_TITLE_ONLY.some((e) => norm(e.phrase) === prefixKey)) {
      prefixLen = i;
      prefixTokens = i;
    }
  }

  if (prefixLen > 0 && prefixLen < tokens.length) {
    const namePart = tokens.slice(prefixLen).join(' ');
    if (looksLikeNameToken(tokens[prefixLen]!)) {
      return {
        isTitleOnly: false,
        displayName,
        needsResolution: false,
        hasAttachedName: true,
        attachedName: namePart,
      };
    }
  }

  // Entire phrase is title tokens only
  if (tokens.every((t) => isTitleOnlyToken(t))) {
    return {
      isTitleOnly: true,
      referenceType: referenceTypeForPhrase(raw),
      displayName,
      needsResolution: true,
      hasAttachedName: false,
    };
  }

  return {
    isTitleOnly: false,
    displayName,
    needsResolution: false,
    hasAttachedName: false,
  };
}

export function evaluateTitleOnlyPersonGuard(text: string): TitleOnlyGuardResult {
  return parsePersonSurface(text);
}

/**
 * Minimum Person Entity Rule — PERSON must contain a given/family name, alias,
 * nickname, stage name, or known canon match.
 */
export function isMinimumPersonEntity(
  name: string,
  options: { canonMatch?: boolean } = {}
): boolean {
  if (options.canonMatch) return true;
  const parsed = parsePersonSurface(name);
  if (parsed.isTitleOnly) return false;
  if (parsed.hasAttachedName) return true;

  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    const nameTokens = tokens.filter((t) => looksLikeNameToken(t));
    return nameTokens.length >= 1 && nameTokens.some((t) => !isTitleOnlyToken(t));
  }

  if (tokens.length === 1) {
    const t = tokens[0]!;
    if (isTitleOnlyToken(t)) return false;
    if (looksLikeNameToken(t)) return true;
  }

  return false;
}

export function personReferenceTypeToEntityType(
  ref: PersonReferenceType
): 'TITLE_REFERENCE' | 'ROLE_REFERENCE' | 'FAMILY_REFERENCE' | 'UNRESOLVED_PERSON_REFERENCE' {
  return ref;
}
