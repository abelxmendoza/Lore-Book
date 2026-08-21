/**
 * Client-side mention lifecycle helpers.
 * Mirrors server mentionClassifier for filtering chips when lifecycleStatus
 * is missing on older message rows.
 */

export type MentionLifecycleStatus =
  | 'RESOLVED'
  | 'UNRESOLVED'
  | 'GENERIC'
  | 'GROUP'
  | 'IGNORE';

const SELF = /^(?:also\s+)?(?:you|me|myself|self|the user|user)(?:\s*\((?:also|self|user|narrator)\))?$/i;
/** Sentence adverbs / function words that look like proper names when capitalized. */
const DISCOURSE_MARKERS = new Set([
  'also',
  'however',
  'besides',
  'furthermore',
  'moreover',
  'meanwhile',
  'anyway',
  'instead',
  'still',
  'yet',
  'though',
  'although',
  'therefore',
  'otherwise',
  'regardless',
  'and',
  'but',
  'or',
  'so',
  'then',
  'than',
  'because',
  'about',
]);
const INDEFINITE =
  /^(?:(?:a|an|one|some|that|this|the|new|other|another)\s+)?(?:girl|guy|man|woman|person|dude|lady)s?$/i;
const VAGUE_COLLECTIVE =
  /^(?:(?:the|some|other|those|these|my|our)\s+)?(?:other\s+)?(?:girls|guys|people|folks|friends|coworkers|co-workers|organizers|attendees|fans|users|boys|kids|egirls|e-girls|popular egirls)(?:\s+in\s+the\s+scene)?$/i;
const TRUNCATED = /^(?:people|folks|girls|guys)\s+in(?:\s+the)?$/i;
const TRUNCATED_KINSHIP =
  /^(?:(?:my|our|his|her|their)\s+)?(?:cousin|uncle|aunt|tio|tia|tío|tía|nephew|niece|brother|sister|sibling|mom|dad|mother|father)s?\s+(?:in|at|of|from|with|and|to)$/i;
const DISCOURSE_BLEED = /^(?:also|and|plus|including)\s+\S+/i;
const DEMONSTRATIVE_KINSHIP =
  /^(?:cousin|uncle|aunt|tio|tia|tío|tía|nephew|niece|brother|sister|sibling)s?\s+(?:those|these|that|this|them|they|the)$/i;
const POSSESSIVE_PLACE =
  /^(?:my|his|her|their|our)\s+(?:house|home|place|room|apartment|pad)$/i;
const POSSESSIVE_UNRESOLVED_ROLE =
  /^(?:my|his|her|their|our|your)\s+(?:friend|best friend|coworker|co-worker|colleague|roommate|neighbor|classmate|bandmate|teammate|cousin|uncle|aunt|promoter|manager|boss)$/i;
const POSSESSIVE_NAME_PLACE =
  /^(?:t[íi]o|t[íi]a|uncle|aunt|abuela|abuelo|grandma|grandpa)\s+[^\s'']+['']s$/i;
const RELATIONSHIP_ROLE =
  /^(?:(?:the|my|his|her|their|an?)\s+)?(?:ex(?:\s|-)?(?:lover|boyfriend|girlfriend|partner|husband|wife)?|lover|boyfriend|girlfriend|partner|husband|wife|crush)$/i;
const TOOL_OR_MEDIA =
  /^(?:claude(?:\s+code)?|codex|cursor|chatgpt|chat gpt|copilot|github\s*copilot|vs\s*code|vscode|one piece|magic(?:\s+the)?\s+gathering|mtg)$/i;
const PERSONA_OR_TEMPORAL =
  /^(?:therapist|archivist|narrator|assistant|system|current event|this weekend|this week|memorial day(?: weekend)?|tonight|today|yesterday|tomorrow)$/i;
const DATE_ONLY =
  /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?$/i;
const BARE_ROLE =
  /^(?:mom|dad|mother|father|uncle|aunt|cousin|sibling|brother|sister|roommate|friend|therapist|archivist)$/i;
const PROPER_NAME = /^[A-ZÀ-Ý][a-zà-ÿ'’-]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ'’-]+){0,2}$/;
const CONTEXTUAL_GROUP =
  /\b(?:who|from|with|at|discussing|repost|comment|attend|members of)\b/i;

export function inferMentionLifecycleStatus(name: string): MentionLifecycleStatus {
  const key = name.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key || SELF.test(key)) return 'IGNORE';
  if (DISCOURSE_MARKERS.has(key)) return 'IGNORE';
  if (
    TOOL_OR_MEDIA.test(key) ||
    PERSONA_OR_TEMPORAL.test(key) ||
    DATE_ONLY.test(key) ||
    DISCOURSE_BLEED.test(key) ||
    TRUNCATED_KINSHIP.test(key) ||
    DEMONSTRATIVE_KINSHIP.test(key) ||
    POSSESSIVE_PLACE.test(key) ||
    POSSESSIVE_NAME_PLACE.test(key) ||
    RELATIONSHIP_ROLE.test(key) ||
    BARE_ROLE.test(key)
  ) {
    return 'IGNORE';
  }
  if (POSSESSIVE_UNRESOLVED_ROLE.test(key)) return 'UNRESOLVED';
  if (INDEFINITE.test(key) || VAGUE_COLLECTIVE.test(key) || TRUNCATED.test(key)) return 'GENERIC';
  if (/\b(?:girls|guys|people|friends|commenters|members)\b/i.test(name) && CONTEXTUAL_GROUP.test(name)) {
    return 'GROUP';
  }
  if (/^anonymous\b/i.test(name)) return 'UNRESOLVED';
  if (PROPER_NAME.test(name.trim())) return 'RESOLVED';
  return 'UNRESOLVED';
}

export function resolveMentionLifecycleStatus(
  name: string,
  lifecycleStatus?: MentionLifecycleStatus | null,
): MentionLifecycleStatus {
  // Always re-check pollution — older rows may be marked RESOLVED for junk names.
  const inferred = inferMentionLifecycleStatus(name);
  if (inferred === 'IGNORE' || inferred === 'GENERIC') return inferred;
  return lifecycleStatus ?? inferred;
}

export function isCastWorthyMention(
  name: string,
  lifecycleStatus?: MentionLifecycleStatus | null,
): boolean {
  return resolveMentionLifecycleStatus(name, lifecycleStatus) === 'RESOLVED';
}

export function isTranscriptMentionWorthy(
  name: string,
  lifecycleStatus?: MentionLifecycleStatus | null,
): boolean {
  const status = resolveMentionLifecycleStatus(name, lifecycleStatus);
  return status === 'RESOLVED' || status === 'UNRESOLVED' || status === 'GROUP';
}

export function isBuildingOnWorthy(
  name: string,
  lifecycleStatus?: MentionLifecycleStatus | null,
): boolean {
  return resolveMentionLifecycleStatus(name, lifecycleStatus) === 'RESOLVED';
}
