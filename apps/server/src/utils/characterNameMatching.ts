/**
 * Title-aware character name matching.
 *
 * Phase 4 rule: kinship titles (Tía, Tío, Mom, Abuela) are NOT identity —
 * match on the core given name / kinship role after title removal.
 *
 * "Tía Grace" vs "Tía Lourdes" → Grace ≠ Lourdes → different people.
 * "Tío Juan" vs "Tio Juan" → same core after accent normalization.
 * "Mom" vs "Mother" → same kinship role bucket.
 */

import { jaroWinkler } from './jaroWinkler';
import { normalizeNameKey, nameContained, namesOverlapByContainment } from './nameNormalization';

/** Kinship role buckets — synonyms map to the same canonical role key. */
export const KINSHIP_ROLE_SYNONYMS: Record<string, string[]> = {
  mother: ['mom', 'mother', 'mama', 'mamá', 'ma', 'mommy', 'mum'],
  father: ['dad', 'father', 'papa', 'papá', 'pa', 'daddy'],
  grandmother: ['abuela', 'abuelita', 'grandma', 'grandmother', 'nana', 'nonna', 'granny'],
  grandfather: ['abuelo', 'abuelito', 'grandpa', 'grandfather', 'nono', 'papa grande'],
  stepfather: ['step dad', 'stepdad', 'step father', 'step-father'],
  stepmother: ['step mom', 'stepmom', 'step mother', 'step-mother'],
  uncle: ['tio', 'tío', 'uncle'],
  aunt: ['tia', 'tía', 'aunt', 'auntie'],
  cousin: ['cousin', 'primo', 'prima'],
  sibling: ['brother', 'sister', 'hermano', 'hermana'],
};

const KINSHIP_PREFIX_RE =
  /^(?:my\s+|our\s+)?(?:(?:step(?:\s|-)?(?:dad|father|mom|mother))\s+|(?:t[íi]o|t[íi]a|uncle|aunt|abuela|abuelo|abuelita|abuelito|grandma|grandmother|grandpa|grandfather|cousin|primo|prima|brother|sister|hermano|hermana)\s+)?/i;

const PUNCTUATION_RE = /[.,;:!?'"()[\]{}\-–—/\\|@#&*+_=`~]/g;

/** Strip punctuation and collapse whitespace for comparison keys. */
export function normalizeForMatching(name: string): string {
  return normalizeNameKey(name.replace(PUNCTUATION_RE, ' '));
}

/** Extract kinship role bucket if the entire name is a title-only kinship term. */
export function kinshipRoleKey(name: string): string | null {
  const norm = normalizeForMatching(name);
  for (const [role, variants] of Object.entries(KINSHIP_ROLE_SYNONYMS)) {
    if (variants.some(v => normalizeForMatching(v) === norm)) return role;
  }
  return null;
}

export type ParsedCharacterName = {
  raw: string;
  normalized: string;
  /** Given name after kinship title removal (empty for title-only). */
  coreName: string;
  /** Kinship role bucket when title-only or titled person. */
  kinshipRole: string | null;
  /** Title tokens stripped from the front. */
  strippedTitle: string | null;
};

/**
 * Parse a display name into matching components.
 * Title-aware: "Tía Grace" → coreName "grace", kinshipRole null.
 * Title-only: "Abuela" → coreName "", kinshipRole "grandmother".
 */
export function parseCharacterName(name: string): ParsedCharacterName {
  const raw = (name ?? '').trim();
  let working = raw.replace(PUNCTUATION_RE, ' ').replace(/\s+/g, ' ').trim();

  // Step-parent with given name: "Step Dad Ben" → core "ben", role stepfather
  const stepMatch = working.match(/^(?:step\s*(?:dad|father|mom|mother))\s+(.+)$/i);
  if (stepMatch?.[1]?.trim()) {
    const role = /^step\s*(?:dad|father)/i.test(working) ? 'stepfather' : 'stepmother';
    const core = normalizeForMatching(stepMatch[1]);
    return {
      raw,
      normalized: normalizeForMatching(working),
      coreName: core,
      kinshipRole: role,
      strippedTitle: working.split(/\s+/).slice(0, 2).join(' '),
    };
  }

  const roleOnly = kinshipRoleKey(working);
  if (roleOnly) {
    return {
      raw,
      normalized: normalizeForMatching(working),
      coreName: '',
      kinshipRole: roleOnly,
      strippedTitle: working,
    };
  }

  const titledMatch = working.match(KINSHIP_PREFIX_RE);
  let strippedTitle: string | null = null;
  if (titledMatch && titledMatch[0].trim()) {
    strippedTitle = titledMatch[0].trim();
    working = working.slice(titledMatch[0].length).trim();
  }

  const coreName = normalizeForMatching(working);
  let kinshipRole: string | null = null;
  if (strippedTitle) {
    kinshipRole = kinshipRoleKey(strippedTitle.replace(/\s+.*/, '')) ?? kinshipRoleKey(strippedTitle);
  }

  return {
    raw,
    normalized: normalizeForMatching(raw),
    coreName,
    kinshipRole,
    strippedTitle,
  };
}

/** All string keys used for alias / duplicate matching. */
export function buildMatchKeys(name: string, aliases: string[] = []): string[] {
  const keys = new Set<string>();
  const add = (n: string) => {
    const p = parseCharacterName(n);
    keys.add(p.normalized);
    if (p.coreName) keys.add(p.coreName);
    if (p.kinshipRole && !p.coreName) keys.add(`role:${p.kinshipRole}`);
  };
  add(name);
  for (const a of aliases) add(a);
  return Array.from(keys).filter(Boolean);
}

export type NameMatchResult = {
  matches: boolean;
  confidence: number;
  method: 'exact' | 'alias' | 'kinship_role' | 'core_name' | 'containment' | 'fuzzy' | 'none';
  reason?: string;
};

const FUZZY_THRESHOLD = 0.85;
const STRONG_FUZZY_THRESHOLD = 0.93;

/**
 * Title-aware name match between two person labels.
 * Does NOT match on shared title tokens alone.
 */
export function matchCharacterNames(a: string, b: string): NameMatchResult {
  if (!a?.trim() || !b?.trim()) return { matches: false, confidence: 0, method: 'none' };

  const pa = parseCharacterName(a);
  const pb = parseCharacterName(b);

  if (pa.normalized === pb.normalized) {
    return { matches: true, confidence: 1, method: 'exact' };
  }

  // Kinship role-only: Mom ↔ Mother, Abuela ↔ Grandma
  if (pa.kinshipRole && pb.kinshipRole && pa.kinshipRole === pb.kinshipRole) {
    // Both title-only OR same role with same core given name
    if (!pa.coreName && !pb.coreName) {
      return { matches: true, confidence: 0.95, method: 'kinship_role', reason: pa.kinshipRole };
    }
    if (pa.coreName && pb.coreName && pa.coreName === pb.coreName) {
      return { matches: true, confidence: 0.97, method: 'kinship_role', reason: `${pa.kinshipRole}+${pa.coreName}` };
    }
    // Same role, different given names → different people (Tía Grace vs Tía Lourdes)
    if (pa.coreName && pb.coreName && pa.coreName !== pb.coreName) {
      return { matches: false, confidence: 0, method: 'none', reason: 'same_title_different_core' };
    }
  }

  // Core given name exact match after title strip
  if (pa.coreName && pb.coreName && pa.coreName === pb.coreName) {
    return { matches: true, confidence: 0.92, method: 'core_name' };
  }

  // One-sided core containment: Ashley ⊂ Ashley De La Cruz
  if (pa.coreName && pb.coreName) {
    if (nameContained(pa.coreName, pb.coreName) || nameContained(pb.coreName, pa.coreName)) {
      return { matches: true, confidence: 0.88, method: 'containment' };
    }
  } else if (pa.coreName && pb.normalized && nameContained(pa.coreName, pb.normalized)) {
    return { matches: true, confidence: 0.86, method: 'containment' };
  } else if (pb.coreName && pa.normalized && nameContained(pb.coreName, pa.normalized)) {
    return { matches: true, confidence: 0.86, method: 'containment' };
  }

  // Full normalized containment (no title-only false positives)
  if (namesOverlapByContainment(pa.normalized, pb.normalized)) {
    return { matches: true, confidence: 0.84, method: 'containment' };
  }

  // Fuzzy on core names (not titles)
  const left = pa.coreName || pa.normalized;
  const right = pb.coreName || pb.normalized;
  if (left && right && left.length >= 3 && right.length >= 3) {
    const jw = jaroWinkler(left, right);
    if (jw >= STRONG_FUZZY_THRESHOLD) {
      return { matches: true, confidence: jw, method: 'fuzzy' };
    }
    if (jw >= FUZZY_THRESHOLD && Math.abs(left.length - right.length) <= 2) {
      return { matches: true, confidence: jw, method: 'fuzzy' };
    }
  }

  return { matches: false, confidence: 0, method: 'none' };
}

/** Singular alias for readability in services/tests. */
export const matchCharacterName = matchCharacterNames;
