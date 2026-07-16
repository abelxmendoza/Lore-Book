/**
 * Semantic refinements beyond structural Zod.
 * These prevent known failure modes (e.g. "tonight" as PERSON).
 */

const COMMAND_OR_META =
  /^(?:please\s+)?(?:show|tell|list|check|remember|recap|summari[sz]e|update|delete|forget|can you|could you|what do you|who (?:am|is|else)|did i|testing|test the)\b/i;
const GREETING = /^(?:hi|hey|hello|yo|ok(?:ay)?)[!,.\s]*$/i;
const TEMPORAL_ONLY =
  /^(?:tonight|today|tomorrow|yesterday|now|later|soon|this (?:morning|afternoon|evening|weekend|week|month|year)|last (?:night|week|month|year)|next (?:week|month|year))$/i;
const OCCUPATION_WORD =
  /^(?:engineer|developer|technician|manager|contractor|designer|nurse|teacher|doctor|lawyer|artist|musician|student|founder|ceo|quality assurance technician|qa technician|background check)$/i;
const SOFTWARE_OR_MEDIA =
  /^(?:chatgpt|openai|react|typescript|python|ios|android|instagram|tiktok|youtube|spotify|discord|slack|notion|figma|claude(?:\s+code)?|one piece|lorebook|lore book)$/i;
const PLACE_WORD =
  /^(?:home|work|office|school|gym|church|park|beach|downtown|here|there)$/i;
const PROCESS_OR_AUDIT =
  /^(?:background check|reclassification|cleanup|debug|chat bubbles?|styling|ui|user interface)$/i;
// Generic relationship descriptors typed as a person name are pollution, not people.
const RELATIONSHIP_PHRASE = /^(?:ex[- ]?lover|my ex|ex[- ]?girlfriend|ex[- ]?boyfriend)$/i;
const GENERIC_REL =
  /^(?:user|person|they|someone|somebody)\s+(?:has|uses|mentioned)\s+(?:a|an|one)?\s*(?:romantic partner relationship|coworker relationship|relationship)\.?$/i;
const INCOMPLETE_REL =
  /\b(?:has a (?:coworker|friend|partner|romantic) relationship|is in a relationship)\b/i;

export const ALLOWED_ENTITY_TYPES = [
  'PERSON',
  'CHARACTER',
  'ORGANIZATION',
  'LOCATION',
  'PLACE',
  'PROJECT',
  'SKILL',
  'EVENT',
  'ARTIFACT',
  'OTHER',
] as const;

export type AllowedEntityType = (typeof ALLOWED_ENTITY_TYPES)[number];

const PERSON_FORBIDDEN_IF_MATCHES = [
  TEMPORAL_ONLY,
  COMMAND_OR_META,
  GREETING,
  OCCUPATION_WORD,
  SOFTWARE_OR_MEDIA,
  PLACE_WORD,
  PROCESS_OR_AUDIT,
  RELATIONSHIP_PHRASE,
];

/** Suggest a better entity type when PERSON would be wrong. */
export function suggestEntityTypeForName(name: string): AllowedEntityType | null {
  const n = name.trim();
  if (TEMPORAL_ONLY.test(n)) return null;
  if (SOFTWARE_OR_MEDIA.test(n) || /\b(?:app|code|api)\b/i.test(n)) return 'OTHER';
  if (PLACE_WORD.test(n) || /\b(?:club|venue|house|cafe|bar)\b/i.test(n)) return 'LOCATION';
  if (/\b(?:band|company|agency|corp)\b/i.test(n)) return 'ORGANIZATION';
  if (OCCUPATION_WORD.test(n) || /\btechnician|engineer|manager\b/i.test(n)) return null;
  if (PROCESS_OR_AUDIT.test(n)) return null;
  return null;
}

export function isInvalidPersonName(name: string): { invalid: boolean; reason?: string } {
  const n = name.trim();
  if (n.length < 2) return { invalid: true, reason: 'name_too_short' };
  if (n.length > 80) return { invalid: true, reason: 'name_too_long' };
  if (/^[0-9\s./:-]+$/.test(n)) return { invalid: true, reason: 'numeric_or_date_only' };
  if (n.includes('?') || n.endsWith('!')) return { invalid: true, reason: 'question_or_command' };
  for (const re of PERSON_FORBIDDEN_IF_MATCHES) {
    if (re.test(n)) return { invalid: true, reason: `forbidden_pattern:${re.source.slice(0, 40)}` };
  }
  if (COMMAND_OR_META.test(n) || /\b(?:please|tell me|show me|testing the|chat bubble)\b/i.test(n)) {
    return { invalid: true, reason: 'command_phrase' };
  }
  if (
    /\b(?:technician|engineer|developer|manager|specialist|analyst|coordinator)\b/i.test(n) &&
    !/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}$/.test(n)
  ) {
    return { invalid: true, reason: 'occupation_title' };
  }
  return { invalid: false };
}

export function isIncompleteRelationshipText(text: string): boolean {
  const t = text.trim();
  if (GENERIC_REL.test(t)) return true;
  if (INCOMPLETE_REL.test(t) && !/\b(?:with|named|called)\s+[A-Z]/i.test(t)) return true;
  if (/coworker relationship\.?$/i.test(t) && !/\b[A-Z][a-z]+\b.*\b[A-Z][a-z]+\b/.test(t)) {
    return true;
  }
  if (/romantic partner relationship\.?$/i.test(t) && !/\bwith\s+[A-Z]/i.test(t)) {
    return true;
  }
  return false;
}

/** Entity types that must never absorb temporal/occupation/software tokens as names. */
export function entityTypeBlocksName(entityType: string, name: string): string | null {
  const t = entityType.toUpperCase();
  if (t === 'PERSON' || t === 'CHARACTER') {
    const r = isInvalidPersonName(name);
    if (r.invalid) return r.reason ?? 'invalid_person_name';
  }
  return null;
}
