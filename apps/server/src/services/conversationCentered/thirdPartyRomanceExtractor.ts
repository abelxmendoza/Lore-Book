/**
 * Third-party romance extraction.
 *
 * The romantic detector only models the USER's partners; a cue like
 * "her boyfriend Juan" is (correctly) rejected as not-the-user's-partner by
 * `hasThirdPartyPartnerCue` — but the fact that two OTHER people are together
 * (Daisy ↔ Juan) was then dropped instead of stored as a character↔character
 * relationship. This extracts those pairs so they can be persisted to the
 * social graph.
 */

const ROMANTIC_ROLE_GROUP =
  '(boyfriend|girlfriend|partner|husband|wife|fiancé|fiance|fiancée|fiancee|spouse|hubby|wifey|bf|gf|man|woman|lover)';

/** Role → the role the *named partner* plays (his "girlfriend Daisy" → Daisy is the girlfriend). */
function normalizeRole(role: string): { role: string; inverse: string } {
  const r = role.toLowerCase();
  const female = ['girlfriend', 'wife', 'fiancée', 'fiancee', 'wifey', 'gf', 'woman'];
  const male = ['boyfriend', 'husband', 'hubby', 'bf', 'man'];
  if (female.includes(r)) return { role: 'girlfriend', inverse: 'boyfriend' };
  if (male.includes(r)) return { role: 'boyfriend', inverse: 'girlfriend' };
  return { role: 'partner', inverse: 'partner' };
}

// A proper-noun name (case-sensitive uppercase initial), allowing internal dotted
// handles (Oscuri.dad) but never a trailing sentence period. Regexes below omit the
// `i` flag so these stay uppercase-anchored; pronouns/roles are spelled case-aware.
const NAME_TOKEN = "[A-ZÀ-Ý][\\p{L}'’-]*(?:\\.[\\p{L}]+)*";
const NAME = `${NAME_TOKEN}(?:\\s+${NAME_TOKEN}){0,2}`;
const STOPWORDS = new Set([
  'i', 'well', 'so', 'and', 'but', 'because', 'she', 'he', 'they', 'her', 'his',
  'their', 'the', 'a', 'an', 'we', 'you', 'it', 'that', 'this', 'when', 'then',
  'also', 'aka', 'was', 'were', 'is', 'knew', 'too', 'there',
]);

export type ThirdPartyRomance = {
  /** The person who "has" the partner (the antecedent — Daisy). */
  anchorName: string;
  /** The named partner (Juan). */
  partnerName: string;
  /** Role the partner plays relative to the anchor. */
  partnerRole: string;
  anchorRole: string;
  evidence: string;
};

function cleanName(raw: string): string {
  return raw.replace(/\s+/g, ' ').replace(/[.,;:!?]+$/, '').trim();
}

/** Nearest proper-noun person mentioned before `index`, used as the pronoun antecedent. */
function nearestPriorName(text: string, index: number): string | null {
  const before = text.slice(0, index);
  const re = new RegExp(NAME, 'gu');
  let m: RegExpExecArray | null;
  let last: string | null = null;
  while ((m = re.exec(before)) !== null) {
    const candidate = cleanName(m[0]);
    if (!STOPWORDS.has(candidate.toLowerCase().split(' ')[0])) last = candidate;
  }
  return last;
}

export function extractThirdPartyRomances(text: string): ThirdPartyRomance[] {
  if (!text?.trim()) return [];
  const out: ThirdPartyRomance[] = [];
  const seen = new Set<string>();

  const push = (anchor: string | null, partner: string | null, role: string) => {
    const a = anchor ? cleanName(anchor) : '';
    const p = partner ? cleanName(partner) : '';
    if (!a || !p) return;
    if (a.toLowerCase() === p.toLowerCase()) return;
    if (STOPWORDS.has(a.toLowerCase().split(' ')[0]) || STOPWORDS.has(p.toLowerCase().split(' ')[0])) return;
    const { role: partnerRole, inverse } = normalizeRole(role);
    const key = `${a.toLowerCase()}|${p.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ anchorName: a, partnerName: p, partnerRole, anchorRole: inverse, evidence: text.trim().slice(0, 400) });
  };

  // 1) Possessive: "Daisy's boyfriend Juan", "Daisy's boyfriend, Juan"
  const possessive = new RegExp(`(${NAME})['’]s\\s+${ROMANTIC_ROLE_GROUP}\\s*,?\\s*(?:named\\s+)?(${NAME})`, 'gu');
  for (const m of text.matchAll(possessive)) push(m[1], m[3], m[2]);

  // 2) Pronoun: "her boyfriend Juan" → anchor = nearest prior name
  const pronoun = new RegExp(`\\b(?:[Hh]er|[Hh]is|[Tt]heir)\\s+${ROMANTIC_ROLE_GROUP}\\s+(?:named\\s+)?(${NAME})`, 'gu');
  for (const m of text.matchAll(pronoun)) {
    const partner = m[2];
    const anchor = nearestPriorName(text, m.index ?? 0);
    push(anchor, partner, m[1]);
  }

  // 3) Predicate: "Oscuridad is her boyfriend" → partner = subject, anchor = the
  //    pronoun's antecedent (nearest name before the subject).
  const predicate = new RegExp(`(${NAME})\\s+(?:is|was|are|were|being)\\s+(?:[Hh]er|[Hh]is|[Tt]heir)\\s+${ROMANTIC_ROLE_GROUP}`, 'gu');
  for (const m of text.matchAll(predicate)) {
    const partner = m[1];
    const anchor = nearestPriorName(text, m.index ?? 0);
    push(anchor, partner, m[2]);
  }

  return out;
}
