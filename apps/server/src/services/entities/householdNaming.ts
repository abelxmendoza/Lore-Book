/**
 * Deterministic household/family naming.
 *
 * Root cause this fixes: group names came straight from the LLM, producing
 * "Leslie and Tio Family" (a member-concatenation) instead of the natural
 * "Tio Ralph's Family". Families are named after their senior anchor, not by
 * listing members.
 *
 * Rule order:
 *   1. Shared surname → "{Surname} Family".
 *   2. Senior kinship anchor (grandparent > parent > aunt/uncle) → "{Anchor}'s Family".
 *   3. Most-mentioned member → "{Member}'s Family".
 */

export interface HouseholdMember {
  name: string;
  mentions?: number;
}

const KINSHIP_RANK: Array<{ re: RegExp; rank: number }> = [
  { re: /\b(abuela|abuelo|grandma|grandpa|grandmother|grandfather|nana|nonna|nono)\b/i, rank: 3 }, // grandparent
  { re: /\b(mom|mamá|mama|mother|dad|papá|papa|father)\b/i, rank: 2 },                              // parent
  { re: /\b(t[íi]o|t[íi]a|uncle|aunt|auntie)\b/i, rank: 1 },                                        // aunt/uncle
];

function kinshipRank(name: string): number {
  for (const { re, rank } of KINSHIP_RANK) if (re.test(name)) return rank;
  return 0;
}

/** Last token that looks like a surname (Capitalized, not a kinship word). */
function surnameOf(name: string): string | null {
  const tokens = name.trim().split(/\s+/);
  if (tokens.length < 2) return null;
  const last = tokens[tokens.length - 1];
  if (!/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ'’-]+$/.test(last)) return null;
  if (kinshipRank(last) > 0) return null;
  return last;
}

/** Possessive form: "Ralph" → "Ralph's", "Tomás" → "Tomás'". */
function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

/**
 * Name a family/household from its members. Deterministic — no LLM.
 * Returns null only when there are no usable members (caller keeps its fallback).
 */
export function nameHousehold(members: HouseholdMember[]): string | null {
  const valid = members.filter((m) => m.name && m.name.trim().length > 0);
  if (valid.length === 0) return null;

  // 1) Shared surname across ≥2 members.
  const surnameCounts = new Map<string, number>();
  for (const m of valid) {
    const s = surnameOf(m.name);
    if (s) surnameCounts.set(s, (surnameCounts.get(s) ?? 0) + 1);
  }
  for (const [surname, count] of surnameCounts) {
    if (count >= 2) return `${surname} Family`;
  }

  // 2) Senior kinship anchor (highest rank; ties broken by mentions, then name length).
  const ranked = [...valid].sort((a, b) => {
    const dr = kinshipRank(b.name) - kinshipRank(a.name);
    if (dr !== 0) return dr;
    const dm = (b.mentions ?? 0) - (a.mentions ?? 0);
    if (dm !== 0) return dm;
    return a.name.length - b.name.length;
  });

  const anchor = ranked[0];
  if (kinshipRank(anchor.name) > 0) {
    return `${possessive(anchor.name.trim())} Family`;
  }

  // 3) Most-mentioned member.
  const byMentions = [...valid].sort((a, b) => (b.mentions ?? 0) - (a.mentions ?? 0));
  return `${possessive(byMentions[0].name.trim())} Family`;
}
