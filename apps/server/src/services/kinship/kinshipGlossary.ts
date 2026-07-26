/**
 * Kinship extraction — maps surface phrases to relationship roles.
 *
 * The kinship VOCABULARY (which surface terms denote which role) is owned by the
 * lexical glossary (services/ontology/glossary.ts → FAMILY entries). This module
 * derives its matching tables from `familyRoleSpecs()` so there is exactly one
 * place to add a kinship term; only the extraction *regex shape* lives here.
 */
import { familyContextWords, familyRoleSpecs } from '../ontology/glossary';

export type KinshipRole =
  | 'GRANDMOTHER'
  | 'GRANDFATHER'
  | 'MOTHER'
  | 'FATHER'
  | 'UNCLE'
  | 'AUNT'
  | 'COUSIN'
  | 'SIBLING'
  | 'SPOUSE'
  | 'CHILD'
  | 'STEPMOTHER'
  | 'STEPFATHER'
  | 'NIECE'
  | 'NEPHEW'
  | 'GRANDCHILD'
  | 'STEPSIBLING'
  | 'GODMOTHER'
  | 'GODFATHER'
  | 'IN_LAW';

export type KinshipMatch = {
  role: KinshipRole;
  canonicalLabel: string;
  sourcePhrase: string;
  confidence: number;
};

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const roleLabel = (role: string): string => role.charAt(0) + role.slice(1).toLowerCase();
const termAlternation = (terms: string[]): string => terms.map(escapeRe).join('|');

/**
 * Title-only kinship (no given name required) — e.g. "Mom", "Abuela".
 * Derived from glossary FAMILY entries flagged kinshipForm: 'TITLE_ONLY'.
 */
const TITLE_ONLY: Array<{ re: RegExp; role: KinshipRole; label: string; confidence: number }> =
  familyRoleSpecs()
    .filter((s) => s.kinshipForm === 'TITLE_ONLY')
    .map((s) => ({
      re: new RegExp(`\\b(?:${termAlternation(s.terms)})(?:['’]s)?\\b`, 'i'),
      role: s.role as KinshipRole,
      label: roleLabel(s.role),
      confidence: s.confidence,
    }));

/**
 * Kinship title + given name → full display name — e.g. "Tío Juan".
 * Derived from glossary FAMILY entries flagged kinshipForm: 'TITLED'.
 */
const TITLED_PERSON: Array<{ re: RegExp; role: KinshipRole; label: string; confidence: number }> =
  familyRoleSpecs()
    .filter((s) => s.kinshipForm === 'TITLED')
    .map((s) => ({
      re: new RegExp(`\\b(?:${termAlternation(s.terms)})\\s+([A-ZÀ-Ý][a-zà-ÿ'’.-]+)\\b`, 'gi'),
      role: s.role as KinshipRole,
      label: roleLabel(s.role),
      confidence: s.confidence,
    }));

/** Any FAMILY surface term (glossary-derived) — for a quick kinship-title check. */
const ANY_KINSHIP_TERM_RE = new RegExp(`\\b(?:${termAlternation(familyContextWords())})\\b`, 'i');

const ROLE_TO_KINSHIP_STRING: Record<KinshipRole, string> = {
  GRANDMOTHER: 'grandmother',
  GRANDFATHER: 'grandfather',
  MOTHER: 'mother',
  FATHER: 'father',
  UNCLE: 'uncle',
  AUNT: 'aunt',
  COUSIN: 'cousin',
  SIBLING: 'sibling',
  SPOUSE: 'spouse',
  CHILD: 'child',
  STEPMOTHER: 'stepmother',
  STEPFATHER: 'stepfather',
  NIECE: 'niece',
  NEPHEW: 'nephew',
  GRANDCHILD: 'grandchild',
  STEPSIBLING: 'stepsibling',
  GODMOTHER: 'godmother',
  GODFATHER: 'godfather',
  IN_LAW: 'in_law',
};

export function kinshipRoleToString(role: KinshipRole): string {
  return ROLE_TO_KINSHIP_STRING[role];
}

/** Surface kinship terms → KinshipRole for free-text "X is my …" claims. */
const SURFACE_TO_ROLE: Array<{ terms: string[]; role: KinshipRole }> = [
  { terms: ['grandmother', 'grandma', 'abuela', 'abuelita', 'nana', 'grammy'], role: 'GRANDMOTHER' },
  { terms: ['grandfather', 'grandpa', 'abuelo', 'abuelito'], role: 'GRANDFATHER' },
  { terms: ['mother', 'mom', 'mommy', 'mum', 'mama', 'mamá'], role: 'MOTHER' },
  { terms: ['father', 'dad', 'daddy', 'papa', 'papá'], role: 'FATHER' },
  { terms: ['stepmother', 'stepmom', 'step mother', 'step-mom'], role: 'STEPMOTHER' },
  { terms: ['stepfather', 'stepdad', 'step father', 'step-dad'], role: 'STEPFATHER' },
  { terms: ['aunt', 'auntie', 'tia', 'tía'], role: 'AUNT' },
  { terms: ['uncle', 'tio', 'tío'], role: 'UNCLE' },
  { terms: ['cousin', 'prima', 'primo'], role: 'COUSIN' },
  { terms: ['brother', 'sister', 'sibling', 'bro', 'sis'], role: 'SIBLING' },
  { terms: ['stepsibling', 'stepbrother', 'stepsister', 'step-brother', 'step-sister'], role: 'STEPSIBLING' },
  { terms: ['niece'], role: 'NIECE' },
  { terms: ['nephew'], role: 'NEPHEW' },
  { terms: ['son', 'daughter', 'child', 'kid'], role: 'CHILD' },
  { terms: ['grandchild', 'grandson', 'granddaughter'], role: 'GRANDCHILD' },
  { terms: ['husband', 'wife', 'spouse', 'partner'], role: 'SPOUSE' },
  { terms: ['godmother'], role: 'GODMOTHER' },
  { terms: ['godfather'], role: 'GODFATHER' },
  { terms: ['in-law', 'in_law', 'brother-in-law', 'sister-in-law'], role: 'IN_LAW' },
];

function roleFromSurfaceKinship(raw: string): KinshipRole | null {
  const key = raw.toLowerCase().trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  for (const { terms, role } of SURFACE_TO_ROLE) {
    if (terms.some((t) => t === key)) return role;
  }
  return null;
}

const KINSHIP_ALT = SURFACE_TO_ROLE.flatMap((s) => s.terms)
  .sort((a, b) => b.length - a.length)
  .map(escapeRe)
  .join('|');

/**
 * Free-text relational claims: "Grace is my aunt", "my cousin James",
 * "she's my mom". Resolves to a KinshipMatch with sourcePhrase = person name
 * when available (or the kinship title alone for pronoun forms).
 */
export function extractRelationalKinshipClaims(text: string): KinshipMatch[] {
  const out: KinshipMatch[] = [];
  const seen = new Set<string>();

  const push = (name: string, role: KinshipRole, confidence: number) => {
    const phrase = name.trim();
    if (!phrase || phrase.length < 2) return;
    // Reject connector words that slip in when the regex is too greedy.
    if (/^(and|or|but|then|with|from|for|the|a|an)$/i.test(phrase)) return;
    const key = `${phrase.toLowerCase()}|${role}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      role,
      canonicalLabel: roleLabel(role),
      sourcePhrase: phrase,
      confidence,
    });
  };

  // Avoid /i on the full pattern — JS makes [A-Z] case-insensitive under /i,
  // which turns "and James" into a false "name". Match kinship case-insensitively
  // by lowercasing the captured kin term instead.
  const nameIsMy = new RegExp(
    `\\b([A-ZÀ-Ý][a-zà-ÿ'’.-]+(?:\\s+[A-ZÀ-Ý][a-zà-ÿ'’.-]+)?)\\s+[Ii][Ss]\\s+(?:[Mm][Yy]|[Oo][Uu][Rr])\\s+(${KINSHIP_ALT})\\b`,
    'g',
  );
  let m: RegExpExecArray | null;
  while ((m = nameIsMy.exec(text)) !== null) {
    const role = roleFromSurfaceKinship(m[2]);
    if (role) push(m[1], role, 0.9);
  }

  const myKinName = new RegExp(
    `\\b(?:[Mm][Yy]|[Oo][Uu][Rr])\\s+(${KINSHIP_ALT})\\s+(?:[Ii][Ss]\\s+)?([A-ZÀ-Ý][a-zà-ÿ'’.-]+)\\b`,
    'g',
  );
  while ((m = myKinName.exec(text)) !== null) {
    const role = roleFromSurfaceKinship(m[1]);
    if (role) push(m[2], role, 0.88);
  }

  // Pronoun form — only useful when a character chip is already focused elsewhere.
  const pronounIsMy = new RegExp(
    `\\b(?:[Ss]he|[Hh]e|[Tt]hey)(?:'s|’s| is| are)\\s+(?:actually\\s+)?(?:[Mm][Yy]|[Oo][Uu][Rr])\\s+(${KINSHIP_ALT})\\b`,
    'g',
  );
  while ((m = pronounIsMy.exec(text)) !== null) {
    const role = roleFromSurfaceKinship(m[1]);
    if (role) push(roleLabel(role), role, 0.75);
  }

  return out;
}

/**
 * Parse a focused-character kinship assertion/correction:
 * "actually she's my aunt", "she's my cousin not my sister", "he is my uncle".
 */
export function parseFocusedKinshipAssertion(text: string): {
  kinship: string;
  role: KinshipRole;
  replaces?: string;
} | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const notPattern = new RegExp(
    `\\b(?:actually[,]?\\s+)?(?:she|he|they)(?:'s|’s| is| are)\\s+(?:my\\s+)?(${KINSHIP_ALT})\\s*,?\\s*not\\s+(?:my\\s+)?(${KINSHIP_ALT})\\b`,
    'i',
  );
  const notMatch = trimmed.match(notPattern);
  if (notMatch) {
    const role = roleFromSurfaceKinship(notMatch[1]);
    if (role) {
      return {
        kinship: kinshipRoleToString(role),
        role,
        replaces: notMatch[2].toLowerCase().replace(/[\s-]+/g, '_'),
      };
    }
  }

  const patterns = [
    new RegExp(
      `\\b(?:actually[,]?\\s+)?(?:she|he|they)(?:'s|’s| is| are)\\s+(?:actually\\s+)?(?:my|our)\\s+(${KINSHIP_ALT})\\b`,
      'i',
    ),
    new RegExp(
      `\\b(?:actually[,]?\\s+)?(?:she|he|they)\\s+is\\s+(?:my\\s+)?(${KINSHIP_ALT})\\b`,
      'i',
    ),
    new RegExp(`\\b(?:correction:?\\s*)?(?:she|he|they)\\s+(?:are|is)\\s+my\\s+(${KINSHIP_ALT})\\b`, 'i'),
  ];
  for (const re of patterns) {
    const match = trimmed.match(re);
    if (!match?.[1]) continue;
    const role = roleFromSurfaceKinship(match[1]);
    if (role) return { kinship: kinshipRoleToString(role), role };
  }
  return null;
}

export function hasKinshipTitle(name: string): boolean {
  const n = name.trim();
  if (!n) return false;
  if (TITLE_ONLY.some(({ re }) => re.test(n))) return true;
  return ANY_KINSHIP_TERM_RE.test(n);
}

/** Extract kinship-titled people from free text. */
export function extractKinshipMentions(text: string): KinshipMatch[] {
  const out: KinshipMatch[] = [];
  const seen = new Set<string>();

  for (const { re, role, label, confidence } of TITLE_ONLY) {
    const m = text.match(re);
    if (!m) continue;
    const name = m[0].trim();
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ role, canonicalLabel: label, sourcePhrase: name, confidence });
  }

  for (const { re, role, label, confidence } of TITLED_PERSON) {
    const regex = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const given = m[1]?.trim();
      if (!given) continue;
      const fullName = `${label === 'Uncle' ? 'Tío' : label === 'Aunt' ? 'Tía' : label} ${given}`;
      const key = fullName.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ role, canonicalLabel: label, sourcePhrase: fullName, confidence });
    }
  }

  return out;
}

export function parseKinshipFromName(name: string): KinshipMatch | null {
  for (const { re, role, label, confidence } of TITLE_ONLY) {
    if (re.test(name)) {
      return { role, canonicalLabel: label, sourcePhrase: name.trim(), confidence };
    }
  }
  for (const { re, role, label, confidence } of TITLED_PERSON) {
    const m = name.match(new RegExp(re.source, re.flags.replace('g', '')));
    if (m) {
      return { role, canonicalLabel: label, sourcePhrase: name.trim(), confidence };
    }
  }
  return null;
}
