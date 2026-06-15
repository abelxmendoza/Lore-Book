/**
 * Sprint AK-1 — Question intent classification
 *
 * Explicit routing for memory/recall/verification queries.
 */

const CHARACTER_CREATION_RE =
  /\b(did you create (a |the )?(character|card|entry)|did you make (a |the )?(character|card)|was a character created|did a character get created|did you create the card|create(d)? (a |the )?card)\b/i;

const SCENE_RECALL_RE =
  /\b(what happened at|what went on at|what occurred at|tell me about|reconstruct|what was it like at)\s+(.+)/i;

const PLACE_SCENE_RE =
  /\b(what happened at|what went on at)\s+(club metro|costco|t[ií]a grace'?s?(?:\s+house)?|[A-Z][\w\s.'-]{2,40})/i;

export type ConversationIntent =
  | 'recall_person'
  | 'person_profile'
  | 'daily_recall'
  | 'thread_recall'
  | 'memory_verification'
  | 'character_creation_check'
  | 'memory_debug'
  | 'scene_recall'
  | 'event_story'
  | 'story_roster'
  | null;

const NAME_CAPTURE = String.raw`([A-ZÁÉÍÓÚÑ][\p{L}\w\s.'-]{1,40})`;

const RECALL_PERSON_RE = new RegExp(
  String.raw`^do you remember\s+${NAME_CAPTURE}\??$`,
  'iu'
);

const PERSON_PROFILE_RE = new RegExp(
  String.raw`\b(?:what do you (?:know|remember) about|tell me (?:everything )?you know about|what have you (?:learned|stored) about|who is|who was)\s+${NAME_CAPTURE}`,
  'iu'
);

const EVENT_STORY_RE = new RegExp(
  String.raw`\b(?:what happened with|what happened (?:to|between)|tell me the story of|what's the story with|what went down with)\s+${NAME_CAPTURE}`,
  'iu'
);

const DAILY_RECALL_RE =
  /\b(what did i do today|what happened today|what have i done today|what was my day like|recap my day)\b/i;

const THREAD_RECALL_RE =
  /\b(what did we talk about|what were we (talking|discussing) about|what have we discussed|recap (this )?(conversation|chat|thread))\b/i;

const MEMORY_VERIFICATION_RE =
  /\b(did you save (that|it|this)|have you saved (that|it|this)|did you store (that|it|this)|did you remember (that|it|this))\b/i;

const MEMORY_DEBUG_RE =
  /\b(testing|test mode|memory debug|debug mode|what was extracted|what changed|what did you store|show me what you (have|stored|saved))\b/i;

export function classifyQuestionIntent(message: string): ConversationIntent {
  const text = message.trim();
  if (!text) return null;

  if (MEMORY_DEBUG_RE.test(text)) return 'memory_debug';
  if (CHARACTER_CREATION_RE.test(text)) return 'character_creation_check';
  if (MEMORY_VERIFICATION_RE.test(text)) return 'memory_verification';

  if (/\bwho are the (people|characters) in my (story|life)\b/i.test(text)) return 'story_roster';

  if (EVENT_STORY_RE.test(text)) return 'event_story';
  if (PLACE_SCENE_RE.test(text) || SCENE_RECALL_RE.test(text)) return 'scene_recall';

  if (DAILY_RECALL_RE.test(text)) return 'daily_recall';
  if (THREAD_RECALL_RE.test(text)) return 'thread_recall';

  if (RECALL_PERSON_RE.test(text)) return 'recall_person';

  if (PERSON_PROFILE_RE.test(text)) return 'person_profile';

  return null;
}

export function extractPersonNameFromIntent(
  message: string,
  intent: ConversationIntent
): string | null {
  const text = message.trim();

  if (intent === 'recall_person') {
    const m = text.match(RECALL_PERSON_RE);
    return m?.[1]?.replace(/[?!.,]+$/, '').trim() ?? null;
  }

  if (intent === 'person_profile') {
    const m = text.match(PERSON_PROFILE_RE);
    return m?.[1]?.replace(/[?!.,]+$/, '').trim() ?? null;
  }

  if (intent === 'event_story') {
    const m = text.match(EVENT_STORY_RE);
    return m?.[1]?.replace(/[?!.,]+$/, '').trim() ?? null;
  }

  if (intent === 'scene_recall') {
    const m = text.match(PLACE_SCENE_RE) ?? text.match(SCENE_RECALL_RE);
    const raw = m?.[2] ?? m?.[1];
    return raw?.replace(/[?!.,]+$/, '').trim() ?? null;
  }

  return null;
}

export function extractSceneQuery(message: string): string | null {
  const placeMatch = message.match(PLACE_SCENE_RE);
  if (placeMatch?.[2]) return placeMatch[2].replace(/[?!.,]+$/, '').trim();

  const m =
    message.match(/\bwhat happened at\s+(.+?)[?.!]?$/i) ??
    message.match(/\bwhat (?:went on|occurred) at\s+(.+?)[?.!]?$/i);
  return m?.[1]?.replace(/[?!.,]+$/, '').trim() ?? null;
}
