/**
 * Sprint AK-1 — Question intent classification
 *
 * Explicit routing for memory/recall/verification queries.
 */

export type ConversationIntent =
  | 'recall_person'
  | 'person_profile'
  | 'daily_recall'
  | 'thread_recall'
  | 'memory_verification'
  | 'character_creation_check'
  | 'memory_debug'
  | null;

const RECALL_PERSON_RE =
  /^do you remember\s+([A-ZÁÉÍÓÚÑ][\w\s.'-]{1,40})\??$/i;

const PERSON_PROFILE_RE =
  /\b(what do you (know|remember) about|tell me (everything )?you know about|what have you (learned|stored) about|who is|who was)\s+([A-ZÁÉÍÓÚÑ][\w\s.'-]{1,40})/i;

const DAILY_RECALL_RE =
  /\b(what did i do today|what happened today|what have i done today|what was my day like|recap my day)\b/i;

const THREAD_RECALL_RE =
  /\b(what did we talk about|what were we (talking|discussing) about|what have we discussed|recap (this )?(conversation|chat|thread))\b/i;

const MEMORY_VERIFICATION_RE =
  /\b(did you save (that|it|this)|have you saved (that|it|this)|did you store (that|it|this)|did you remember (that|it|this))\b/i;

const CHARACTER_CREATION_RE =
  /\b(did you create (a |the )?(character|card|entry)|did you make (a |the )?(character|card)|was a character created|did a character get created)\b/i;

const MEMORY_DEBUG_RE =
  /\b(testing|test mode|memory debug|debug mode|what was extracted|what changed|what did you store|show me what you (have|stored|saved))\b/i;

export function classifyQuestionIntent(message: string): ConversationIntent {
  const text = message.trim();
  if (!text) return null;

  if (MEMORY_DEBUG_RE.test(text)) return 'memory_debug';
  if (CHARACTER_CREATION_RE.test(text)) return 'character_creation_check';
  if (MEMORY_VERIFICATION_RE.test(text)) return 'memory_verification';
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
    return m?.[4]?.replace(/[?!.,]+$/, '').trim() ?? null;
  }

  return null;
}
