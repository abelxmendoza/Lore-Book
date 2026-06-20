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
