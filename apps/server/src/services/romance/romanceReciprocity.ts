export const ROMANCE_RECIPROCITY_VALUES = [
  'unknown',
  'user_interest_only',
  'other_interest_only',
  'possible_mutual',
  'mutual_interest',
] as const;

export type RomanceReciprocity = (typeof ROMANCE_RECIPROCITY_VALUES)[number];

const COMMITTED_OR_DATING = new Set([
  'boyfriend', 'girlfriend', 'wife', 'husband', 'fiancé', 'fiancée',
  'lover', 'dating', 'in_love',
]);

const EXPLICIT_REJECTION_RE =
  /\b(rejected me|turned me down|said no|doesn'?t feel the same|didn'?t feel the same|only sees me as a friend|not interested in me)\b/i;
const EXPLICIT_MUTUAL_RE =
  /\b(we (?:both )?(?:like|want|have feelings for|are into) each other|mutual (?:crush|interest|attraction)|likes? me too|feel(?:s)? the same way|said (?:she|he|they) (?:likes?|is into|has feelings for) me)\b/i;
const POSSIBLE_MUTUAL_RE =
  /\b(?:i (?:think|wonder if|suspect)|maybe|might|could|possibly|seems? like|looks? like) (?:she|he|they) (?:likes?|is into|has feelings for|might like)|(?:she|he|they) (?:might|may|could) (?:like|be into) me\b/i;
const OTHER_ONLY_RE =
  /\b(?:she|he|they) (?:has|have) a crush on me|(?:she|he|they) (?:likes?|is into|has feelings for) me(?:,? but i (?:don'?t|do not))?\b/i;
const USER_ONLY_RE =
  /\b(i (?:have|got) a crush on|i (?:really )?like|i(?:'m| am) into|i have feelings for|i want to date)\b/i;

function normalizeCandidate(value: unknown): RomanceReciprocity | null {
  return ROMANCE_RECIPROCITY_VALUES.includes(value as RomanceReciprocity)
    ? (value as RomanceReciprocity)
    : null;
}

export function inferRomanceReciprocity(input: {
  relationshipType?: string;
  status?: string;
  evidence?: string;
  detected?: unknown;
}): RomanceReciprocity {
  const type = String(input.relationshipType ?? '').toLowerCase();
  const status = String(input.status ?? '').toLowerCase();
  const evidence = String(input.evidence ?? '');

  if (status === 'unrequited' || EXPLICIT_REJECTION_RE.test(evidence)) {
    return 'user_interest_only';
  }
  if (EXPLICIT_MUTUAL_RE.test(evidence)) return 'mutual_interest';
  if (POSSIBLE_MUTUAL_RE.test(evidence)) return 'possible_mutual';
  if (OTHER_ONLY_RE.test(evidence) && !USER_ONLY_RE.test(evidence)) {
    return 'other_interest_only';
  }
  if (USER_ONLY_RE.test(evidence)) return 'user_interest_only';

  const detected = normalizeCandidate(input.detected);
  if (detected) return detected;
  if (COMMITTED_OR_DATING.has(type)) return 'mutual_interest';
  if (['crush', 'infatuation', 'obsession'].includes(type)) return 'user_interest_only';
  return 'unknown';
}

export function mergeRomanceReciprocity(
  existing: unknown,
  incoming: RomanceReciprocity,
  status?: string,
  evidence?: string,
): RomanceReciprocity {
  if (status === 'unrequited' || EXPLICIT_REJECTION_RE.test(evidence ?? '')) {
    return 'user_interest_only';
  }
  const current = normalizeCandidate(existing) ?? 'unknown';
  if (incoming === 'unknown') return current;
  if (incoming === 'mutual_interest') return incoming;
  if (current === 'mutual_interest') return current;
  return incoming;
}
