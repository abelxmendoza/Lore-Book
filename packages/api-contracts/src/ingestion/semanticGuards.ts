/**
 * Semantic refinements beyond structural Zod.
 * These prevent known failure modes (e.g. "tonight" as PERSON).
 */

const COMMAND_OR_META =
  /^(?:please\s+)?(?:show|tell|list|check|remember|recap|summari[sz]e|update|delete|forget|can you|could you|what do you|who (?:am|is|else)|did i|testing|test the)\b/i;
const GREETING = /^(?:hi|hey|hello|yo|ok(?:ay)?)[!,.\s]*$/i;
const TEMPORAL_ONLY =
  /^(?:tonight|today|tomorrow|yesterday|now|later|soon|(?:mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?)|this (?:morning|afternoon|evening|weekend|week|month|year)|last (?:night|week|weekend|month|year)|next (?:week|month|year)|current event|memorial day(?: weekend)?|labor day(?: weekend)?|independence day)$/i;
const SENTENCE_START_FRAGMENT =
  /^(?:(?:today|tomorrow|yesterday|tonight|later|then|now)\s+(?:i|im|i'm|i’m|ill|i'll|i’ll|we|were|we're|we’re|will|should|can|cant|can't|can’t)\b|(?:like|well|actually|maybe|anyway|sometimes|usually|hopefully|fortunately|unfortunately))$/i;
const OCCUPATION_WORD =
  /^(?:engineer|developer|technician|manager|contractor|designer|nurse|teacher|doctor|lawyer|artist|musician|student|founder|ceo|quality assurance technician|qa technician|background check|therapist|archivist)$/i;
const SOFTWARE_OR_MEDIA =
  /^(?:chatgpt|openai|react|typescript|python|ios|android|instagram|tiktok|youtube|spotify|discord|slack|notion|figma|claude(?:\s+code)?|codex|cursor|copilot|github\s*copilot|vs\s*code|vscode|gemini|grok|llama|one piece|lorebook|lore book|magic(?:\s+the)?\s+gathering|mtg)$/i;
const PLACE_WORD =
  /^(?:home|work|office|school|gym|church|park|beach|downtown|here|there|(?:my|his|her|their|our)\s+(?:house|home|place|room))$/i;
const PROCESS_OR_AUDIT =
  /^(?:background check|reclassification|cleanup|debug|chat bubbles?|styling|ui|user interface|current event)$/i;
const COMMON_NOUN_OR_INSTITUTION =
  /^(?:fitness|police|law enforcement|coding|music|sleep|reputation|guilt|shame|focus|peace)$/i;
// Truncated kinship mid-phrase extraction ("Cousin in", "uncle at").
const TRUNCATED_KINSHIP =
  /^(?:(?:my|our|his|her|their)\s+)?(?:cousin|uncle|aunt|tio|tia|tío|tía|nephew|niece|brother|sister|sibling|mom|dad|mother|father)s?\s+(?:in|at|of|from|with|and|to)$/i;
const DATE_ONLY =
  /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?$/i;
const DISCOURSE_PREFIX =
  /^(?:also|and|plus|including)\s+\S+/i;
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
  COMMON_NOUN_OR_INSTITUTION,
  RELATIONSHIP_PHRASE,
  TRUNCATED_KINSHIP,
  DATE_ONLY,
  DISCOURSE_PREFIX,
  SENTENCE_START_FRAGMENT,
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
