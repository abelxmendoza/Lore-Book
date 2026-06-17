/**
 * Canonical kinship dictionary — maps surface phrases to relationship roles.
 */

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
  | 'IN_LAW';

export type KinshipMatch = {
  role: KinshipRole;
  canonicalLabel: string;
  sourcePhrase: string;
  confidence: number;
};

/** Title-only kinship (no given name required). */
const TITLE_ONLY: Array<{ re: RegExp; role: KinshipRole; label: string; confidence: number }> = [
  { re: /\babuel(?:a|ita)(?:['']s)?\b/i, role: 'GRANDMOTHER', label: 'Grandmother', confidence: 0.95 },
  { re: /\b(?:grandma|grandmother|nana|nonna|granny)(?:['']s)?\b/i, role: 'GRANDMOTHER', label: 'Grandmother', confidence: 0.92 },
  { re: /\babuel(?:o|ito)(?:['']s)?\b/i, role: 'GRANDFATHER', label: 'Grandfather', confidence: 0.95 },
  { re: /\b(?:grandpa|grandfather|nono|papa\s+grande)(?:['']s)?\b/i, role: 'GRANDFATHER', label: 'Grandfather', confidence: 0.92 },
  { re: /\b(?:mom|mother|mama|mamá|ma)(?:['']s)?\b/i, role: 'MOTHER', label: 'Mother', confidence: 0.9 },
  { re: /\b(?:dad|father|papa|papá|pa)(?:['']s)?\b/i, role: 'FATHER', label: 'Father', confidence: 0.9 },
];

/** Kinship title + optional given name → full display name. */
const TITLED_PERSON: Array<{ re: RegExp; role: KinshipRole; label: string; confidence: number }> = [
  { re: /\b(?:t[íi]o|uncle)\s+([A-ZÀ-Ý][a-zà-ÿ'’.-]+)\b/gi, role: 'UNCLE', label: 'Uncle', confidence: 0.92 },
  { re: /\b(?:t[íi]a|aunt|auntie)\s+([A-ZÀ-Ý][a-zà-ÿ'’.-]+)\b/gi, role: 'AUNT', label: 'Aunt', confidence: 0.92 },
  { re: /\b(?:primo|prima|cousin)\s+([A-ZÀ-Ý][a-zà-ÿ'’.-]+)\b/gi, role: 'COUSIN', label: 'Cousin', confidence: 0.88 },
  { re: /\b(?:brother|sister|hermano|hermana)\s+([A-ZÀ-Ý][a-zà-ÿ'’.-]+)\b/gi, role: 'SIBLING', label: 'Sibling', confidence: 0.85 },
];

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
  IN_LAW: 'in_law',
};

export function kinshipRoleToString(role: KinshipRole): string {
  return ROLE_TO_KINSHIP_STRING[role];
}

export function hasKinshipTitle(name: string): boolean {
  const n = name.trim();
  if (!n) return false;
  if (TITLE_ONLY.some(({ re }) => re.test(n))) return true;
  return /\b(t[íi]o|t[íi]a|uncle|aunt|abuela|abuelo|grandma|grandpa|cousin|primo|prima|mom|dad|mother|father)\b/i.test(n);
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
