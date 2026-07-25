/**
 * Client-side person intro decomposition (mirrors server identity helper).
 * Keeps Character Book "introduce in chat" prompts from using role-contaminated names.
 */

export type PersonIntroDecomposition = {
  canonicalName: string;
  rolePhrase: string | null;
  supportsAnchor: string | null;
  isNewPersonCue: boolean;
  raw: string;
};

const NEW_PERSON_CUE_RE =
  /\b(?:someone new(?: in my life)?|new (?:person|character|friend|acquaintance))\b/i;

const TRAILING_INTRO_NOISE_RE =
  /(?:,\s*)?(?:someone new(?: in my life)?|a new (?:person|friend))\s*$/i;

const PROFESSIONAL_ROLE_RE =
  /\b(?:social\s+workers?|case\s+workers?|care\s+workers?|nurses?|doctors?|therapists?|counselors?|aides?|caregivers?|teachers?|coaches?|mentors?|recruiters?|agents?)\b/i;

function parsePossessiveRole(phrase: string): { relation: string; anchor: string } | null {
  const cleaned = phrase.replace(/\s+/g, ' ').trim();
  const poss = cleaned.match(/^(.+?)['’]s\s+(.+)$/i);
  if (!poss) return null;
  const relation = poss[2].toLowerCase().trim();
  const anchor = poss[1].trim();
  if (!anchor) return null;
  if (
    relation === 'social worker' ||
    relation === 'case worker' ||
    relation === 'care worker' ||
    PROFESSIONAL_ROLE_RE.test(relation)
  ) {
    return { relation, anchor };
  }
  return null;
}

export function decomposePersonIntro(rawInput: string): PersonIntroDecomposition {
  const raw = (rawInput ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) {
    return {
      canonicalName: '',
      rolePhrase: null,
      supportsAnchor: null,
      isNewPersonCue: false,
      raw: '',
    };
  }

  const isNewPersonCue = NEW_PERSON_CUE_RE.test(raw);
  let working = raw.replace(TRAILING_INTRO_NOISE_RE, '').trim();
  let rolePhrase: string | null = null;
  let supportsAnchor: string | null = null;

  const commaIdx = working.indexOf(',');
  if (commaIdx !== -1) {
    const head = working.slice(0, commaIdx).trim();
    const appositive = working.slice(commaIdx + 1).trim().replace(TRAILING_INTRO_NOISE_RE, '').trim();
    const ph = parsePossessiveRole(appositive);
    if (ph) {
      rolePhrase = ph.relation;
      supportsAnchor = ph.anchor;
      working = head;
    } else if (head && /^[A-ZÀ-Ý]/.test(head)) {
      working = head;
      if (appositive && PROFESSIONAL_ROLE_RE.test(appositive)) {
        rolePhrase = appositive.toLowerCase();
      } else if (appositive) {
        rolePhrase = appositive;
      }
    }
  }

  return {
    canonicalName: working.replace(/[.,;:!?]+$/g, '').trim(),
    rolePhrase,
    supportsAnchor,
    isNewPersonCue,
    raw,
  };
}
