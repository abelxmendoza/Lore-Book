/**
 * Infer biological/social sex signals from kinship titles and roles.
 * Soft inference only — never overwrites user_confirmed / explicit sex.
 */
import type { KinshipRole } from './kinshipGlossary';

export type InferredSex = 'male' | 'female';

const ROLE_SEX: Partial<Record<KinshipRole, InferredSex>> = {
  MOTHER: 'female',
  FATHER: 'male',
  GRANDMOTHER: 'female',
  GRANDFATHER: 'male',
  AUNT: 'female',
  UNCLE: 'male',
  STEPMOTHER: 'female',
  STEPFATHER: 'male',
  NIECE: 'female',
  NEPHEW: 'male',
  GODMOTHER: 'female',
  GODFATHER: 'male',
};

/** Surface terms that carry sex even when role collapses (SIBLING / COUSIN / CHILD). */
const PHRASE_SEX: Array<{ re: RegExp; sex: InferredSex }> = [
  { re: /\b(mom|mother|mamá|mama|mommy|mum|abuela|abuelita|grandma|grandmother|aunt|tía|tia|auntie|sister|hermana|niece|godmother|stepmother|step\s*mom|wife|girlfriend|daughter|prima)\b/i, sex: 'female' },
  { re: /\b(dad|father|papá|papa|daddy|abuelo|abuelito|grandpa|grandfather|uncle|tío|tio|brother|hermano|nephew|godfather|stepfather|step\s*dad|husband|boyfriend|son|primo)\b/i, sex: 'male' },
];

const KINSHIP_STRING_SEX: Record<string, InferredSex> = {
  mother: 'female',
  mom: 'female',
  grandmother: 'female',
  grandma: 'female',
  aunt: 'female',
  sister: 'female',
  niece: 'female',
  stepmother: 'female',
  godmother: 'female',
  wife: 'female',
  daughter: 'female',
  father: 'male',
  dad: 'male',
  grandfather: 'male',
  grandpa: 'male',
  uncle: 'male',
  brother: 'male',
  nephew: 'male',
  stepfather: 'male',
  godfather: 'male',
  husband: 'male',
  son: 'male',
};

export function sexFromKinshipRole(role: KinshipRole): InferredSex | null {
  return ROLE_SEX[role] ?? null;
}

export function sexFromKinshipPhrase(phrase: string): InferredSex | null {
  const text = phrase.trim();
  if (!text) return null;
  for (const { re, sex } of PHRASE_SEX) {
    if (re.test(text)) return sex;
  }
  return null;
}

export function sexFromKinshipString(kinship: string | null | undefined): InferredSex | null {
  if (!kinship) return null;
  const compact = kinship.toLowerCase().replace(/[\s_-]+/g, '');
  for (const [k, sex] of Object.entries(KINSHIP_STRING_SEX)) {
    if (compact === k.replace(/[\s_-]+/g, '')) return sex;
  }
  return sexFromKinshipPhrase(kinship);
}

/** Prefer role, then surface phrase (for brother/sister/primo/prima). */
export function sexFromKinship(role: KinshipRole | null | undefined, phrase?: string): InferredSex | null {
  if (role) {
    const fromRole = sexFromKinshipRole(role);
    if (fromRole) return fromRole;
  }
  if (phrase) return sexFromKinshipPhrase(phrase);
  return null;
}

const LOCKED_SEX_SOURCES = new Set(['user_confirmed', 'explicit']);

export function canSoftWriteSex(metadata: Record<string, unknown> | null | undefined): boolean {
  const meta = metadata ?? {};
  const source = String(meta.sex_source ?? '');
  if (LOCKED_SEX_SOURCES.has(source)) return false;
  const current = String(meta.sex ?? 'unknown').toLowerCase();
  if (current === 'male' || current === 'female' || current === 'nonbinary') {
    // Allow upgrade only from weaker inference → keep existing inferred value.
    return source !== 'kinship_inferred';
  }
  return true;
}

export function kinshipSexMetadataPatch(
  metadata: Record<string, unknown> | null | undefined,
  sex: InferredSex,
): Record<string, unknown> | null {
  if (!canSoftWriteSex(metadata)) return null;
  const meta = metadata ?? {};
  if (String(meta.sex ?? '').toLowerCase() === sex && meta.sex_source === 'kinship_inferred') {
    return null;
  }
  return {
    ...meta,
    sex,
    sex_source: 'kinship_inferred',
  };
}
