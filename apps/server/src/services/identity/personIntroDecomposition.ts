/**
 * Person introduction decomposition — split contaminated intro phrases into
 * canonical name + role + relationship anchor.
 *
 * "Jessica, Juan's Social Worker, someone new in my life"
 *   → canonicalName: Jessica
 *   → rolePhrase: social worker
 *   → supportsAnchor: Juan
 */

import { parseRelationalPlaceholder } from '../../utils/characterNameMatching';

export type PersonIntroDecomposition = {
  /** Clean person name suitable for Character Book. */
  canonicalName: string;
  /** Occupational / relational role stripped from the name, if any. */
  rolePhrase: string | null;
  /** Person this role supports / belongs to (e.g. Juan from "Juan's social worker"). */
  supportsAnchor: string | null;
  /** True when the text cues a new-person introduction. */
  isNewPersonCue: boolean;
  /** Original input (trimmed). */
  raw: string;
};

const NEW_PERSON_CUE_RE =
  /\b(?:someone new(?: in my life)?|new (?:person|character|friend|acquaintance)|just met|met (?:her|him|them) (?:recently|today|for the first time))\b/i;

const TRAILING_INTRO_NOISE_RE =
  /(?:,\s*)?(?:someone new(?: in my life)?|a new (?:person|friend)|whom I just met)\s*$/i;

/**
 * Decompose a free-text person introduction into structured fields.
 * Safe for empty / non-person strings — returns whatever remains as canonicalName.
 */
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

  // Comma appositive: "Jessica, Juan's Social Worker" or "Jessica, my social worker"
  const commaIdx = working.indexOf(',');
  if (commaIdx !== -1) {
    const head = working.slice(0, commaIdx).trim();
    const appositive = working.slice(commaIdx + 1).trim();
    const fromAppositive = extractRoleFromPhrase(appositive);
    if (fromAppositive.rolePhrase || fromAppositive.supportsAnchor) {
      rolePhrase = fromAppositive.rolePhrase;
      supportsAnchor = fromAppositive.supportsAnchor;
      working = head;
    } else if (head && /^[A-ZÀ-Ý]/.test(head)) {
      // Still strip unknown appositive noise from the canonical name.
      working = head;
      if (appositive && !rolePhrase) {
        rolePhrase = appositive.replace(TRAILING_INTRO_NOISE_RE, '').trim() || null;
      }
    }
  }

  // Whole string is a relational placeholder: "Juan's Social Worker"
  if (!rolePhrase) {
    const fromWhole = extractRoleFromPhrase(working);
    if (fromWhole.rolePhrase && fromWhole.supportsAnchor && looksLikeBareRoleLabel(working)) {
      // Not a person name — keep working as-is for gate reject; surface role metadata.
      rolePhrase = fromWhole.rolePhrase;
      supportsAnchor = fromWhole.supportsAnchor;
    } else if (fromWhole.rolePhrase && !looksLikeBareRoleLabel(working)) {
      // e.g. trailing "the social worker" already handled elsewhere
      rolePhrase = fromWhole.rolePhrase;
      supportsAnchor = fromWhole.supportsAnchor ?? supportsAnchor;
    }
  }

  // Trailing "the <Role>"
  const theRole = working.match(/^(.+?)\s+the\s+(.+)$/i);
  if (theRole && !rolePhrase) {
    const maybeRole = extractRoleFromPhrase(theRole[2]);
    if (maybeRole.rolePhrase || PROFESSIONAL_ROLE_RE.test(theRole[2])) {
      working = theRole[1].trim();
      rolePhrase = maybeRole.rolePhrase ?? theRole[2].trim().toLowerCase();
      supportsAnchor = maybeRole.supportsAnchor ?? supportsAnchor;
    }
  }

  const canonicalName = working.replace(/[.,;:!?]+$/g, '').trim();

  return {
    canonicalName,
    rolePhrase: rolePhrase ? normalizeRolePhrase(rolePhrase) : null,
    supportsAnchor: supportsAnchor ? supportsAnchor.trim() : null,
    isNewPersonCue,
    raw,
  };
}

const PROFESSIONAL_ROLE_RE =
  /\b(?:social\s+workers?|case\s+workers?|care\s+workers?|nurses?|doctors?|therapists?|counselors?|counsellors?|aides?|caregivers?|carers?|teachers?|coaches?|mentors?|recruiters?|agents?)\b/i;

function looksLikeBareRoleLabel(text: string): boolean {
  // "Juan's Social Worker" / "social worker of Juan" — no standalone given name as head.
  const ph = parseRelationalPlaceholder(text);
  if (ph) return true;
  return PROFESSIONAL_ROLE_RE.test(text) && !/^[A-ZÀ-Ý][a-zà-ÿ]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ]+)?,\s/.test(text);
}

function extractRoleFromPhrase(phrase: string): {
  rolePhrase: string | null;
  supportsAnchor: string | null;
} {
  const cleaned = phrase.replace(TRAILING_INTRO_NOISE_RE, '').trim();
  if (!cleaned) return { rolePhrase: null, supportsAnchor: null };

  const ph = parseRelationalPlaceholder(cleaned);
  if (ph) {
    return { rolePhrase: ph.relation, supportsAnchor: ph.anchor };
  }

  // "my social worker" / "a social worker"
  const myRole = cleaned.match(/^(?:my|a|an|the|his|her|their|our)\s+(.+)$/i);
  if (myRole && PROFESSIONAL_ROLE_RE.test(myRole[1])) {
    return { rolePhrase: myRole[1].trim().toLowerCase(), supportsAnchor: null };
  }

  if (PROFESSIONAL_ROLE_RE.test(cleaned) && cleaned.split(/\s+/).length <= 4) {
    return { rolePhrase: cleaned.toLowerCase(), supportsAnchor: null };
  }

  return { rolePhrase: null, supportsAnchor: null };
}

function normalizeRolePhrase(role: string): string {
  return role.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Conversational "tell you about X" framing used by Character Book intro presets. */
const TELL_ABOUT_FRAME_RE =
  /\b(?:(?:i\s+)?(?:want|wanna|need|like)\s+to\s+tell\s+(?:you\s+)?about|let\s+me\s+tell\s+(?:you\s+)?about|i(?:'|’)d\s+like\s+(?:you\s+)?to\s+(?:meet|know))\b/i;

/** Canonicalized quest titles after stripping "I want to" → "Tell you about Jamie". */
const CANONICAL_TELL_ABOUT_TITLE_RE = /^tell(?:\s+you)?\s+about\b/i;

/**
 * True when text is (or was) a person-onboarding utterance, not a durable quest.
 * Used to keep Character Book intros out of Suggested Quests / goal cognition.
 */
export function isConversationalPersonIntro(text: string): boolean {
  const trimmed = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return false;
  if (CANONICAL_TELL_ABOUT_TITLE_RE.test(trimmed)) return true;
  if (TELL_ABOUT_FRAME_RE.test(trimmed)) return true;
  return detectPersonOnboardingIntent(trimmed).detected;
}

/**
 * Strip person-intro framing so co-occurring real goals can still be detected.
 */
export function stripConversationalPersonIntro(text: string): string {
  return (text ?? '')
    .replace(
      /\b(?:(?:i\s+)?(?:want|wanna|need|like)\s+to\s+tell\s+(?:you\s+)?about|let\s+me\s+tell\s+(?:you\s+)?about|i(?:'|’)d\s+like\s+(?:you\s+)?to\s+(?:meet|know))\b[^.!?\n]*/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detect explicit new-person introduction intent in a full user message.
 */
export function detectPersonOnboardingIntent(text: string): {
  detected: boolean;
  candidateName: string | null;
  decomposition: PersonIntroDecomposition | null;
} {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return { detected: false, candidateName: null, decomposition: null };

  // "I want to tell you about Jamie, ..." / "want to tell you about ..."
  const tellAbout = trimmed.match(
    /\b(?:(?:i\s+)?(?:want|wanna|need|like)\s+to\s+tell\s+(?:you\s+)?about|let\s+me\s+tell\s+(?:you\s+)?about|i(?:'|’)d like (?:you )?to (?:meet|know))\s+([^.…\n]{1,80}?)(?:\.|$)/i,
  );
  if (tellAbout) {
    const decomp = decomposePersonIntro(tellAbout[1]);
    if (decomp.canonicalName) {
      return {
        detected: true,
        candidateName: decomp.canonicalName,
        decomposition: decomp,
      };
    }
  }

  // Canonicalized titles after LEADING_INTENT strip: "Tell you about Jamie"
  const titleTell = trimmed.match(/^tell(?:\s+you)?\s+about\s+([^.…\n]{1,80})$/i);
  if (titleTell) {
    const decomp = decomposePersonIntro(titleTell[1]);
    if (decomp.canonicalName) {
      return {
        detected: true,
        candidateName: decomp.canonicalName,
        decomposition: decomp,
      };
    }
  }

  if (NEW_PERSON_CUE_RE.test(trimmed)) {
    // Fallback: first Proper Name before "someone new"
    const before = trimmed.split(NEW_PERSON_CUE_RE)[0] ?? '';
    const nameMatch = before.match(/\b([A-ZÀ-Ý][a-zà-ÿ]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ]+){0,2})\b(?=[^A-Za-z]*$)/);
    if (nameMatch) {
      const decomp = decomposePersonIntro(nameMatch[1]);
      return {
        detected: true,
        candidateName: decomp.canonicalName,
        decomposition: decomp,
      };
    }
    return { detected: true, candidateName: null, decomposition: null };
  }

  return { detected: false, candidateName: null, decomposition: null };
}
