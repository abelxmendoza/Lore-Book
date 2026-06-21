/**
 * Shared recall intent patterns — used by router, mode gate, and coverage scripts.
 */

export const BIOGRAPHY_RE =
  /\b(what do you know about me|who am i|what.s my story|tell me about myself|what have you learned|what you('ve| have) learned|my biography|my life story|what do you remember about me|recall (everything|all|things).*(about )?me|recall (everything|all) (you('ve| have) )?(learned|know)|recall what you('ve| have) learned)\b/i;

export const CHARACTER_LIST_RE =
  /\b(who do you remember|how many (characters|people) do you (remember|know)|who are the (characters|people) in my (story|life)|who are the people in my (story|life)|who('?s| is) in my (story|life)|tell me (about )?(the )?(people|characters) (you know|in my story|i('?ve| have) (mentioned|talked about))|list (the )?(people|characters) (you know|i('?ve| have) mentioned)|who have i (told you about|mentioned)|recall (all )?(the )?(characters|people) (in my (story|life)|you know|i('?ve| have) mentioned)|recall (everyone|everybody) (in my (story|life)|you know))\b/i;

export const FAMILY_RECALL_RE =
  /\b(tell me about my family|my family members?|members of my family|who are my (relatives|family members?)|recall.*(family members?|my family)|things you('ve| have) learned about me and my family|what you know about me and my family|recall.*my family)\b/i;

export const FAMILY_KIN_TERM_RE =
  /\b(tell me about my (grandmother|grandfather|grandma|grandpa|mother|father|brother|sister|cousin|relatives)|my (grandmother|grandfather|grandma|grandpa|relatives))\b/i;

const ENTITY_PREFIX_RE =
  /\b(tell me about|what do you know about|what happened with|remember about|recall|who (?:is|was))\s+(?!my family|myself|me\b|the characters|the people)\b/i;

export { ENTITY_PREFIX_RE };

/** True when message asks about a specific named person (capitalized proper noun). */
export function matchesEntityQuery(message: string): boolean {
  const m = message.trim().match(ENTITY_PREFIX_RE);
  if (!m || m.index === undefined) return false;
  const rest = message.slice(m.index + m[0].length).trim();
  const nameMatch = rest.match(/^([A-ZÁÉÍÓÚÑ][\w.'-]{1,40}(?:\s+(?:de|del|la|los|las|y|van|von|di|da|le|el|the|a|an|T[ií]o|T[ií]a)\s+[A-ZÁÉÍÓÚÑ][\w.'-]{1,40}){0,8})/);
  const name = nameMatch?.[1]?.replace(/[?!.,]+$/, '').trim() ?? rest.split(/[\s,?!.]+/)[0] ?? '';
  if (!name || /^(that|the|this|a|an|it|everything|anything)$/i.test(name)) return false;
  return /^[A-ZÁÉÍÓÚÑ]/.test(name);
}

export const ENTITY_QUERY_RE = ENTITY_PREFIX_RE;

export const TEMPORAL_RE =
  /\b(recently|lately|what.*(was|were|have) i (doing|up to|working|building)|what happened (lately|recently|this week|today)|just (did|told you|mentioned)|what.*(last|past) (few|couple|week|month))\b/i;

export const THREAD_RE =
  /\b(earlier|this conversation|what we (discussed|talked|were talking)|remember what i (said|told)|in this (chat|thread)|what did i (just )?(say|tell|mention)|what were we (talking|discussing)|what have i (said|told|shared) (so far|here|in this))\b/i;

/** User wants a structured recap of the current thread — not vector journal search. */
export const CONVERSATION_RECALL_RE =
  /\b(what else did i (say|tell|mention)|what did i (say|tell|mention) (in|during|about) (this|the|our) (conversation|chat|thread)|what else (did )?i tell you (in )?(this )?(conversation|chat|thread)|what (else )?(have|did) i (say|tell|share|mention) (in |during )?(this |the |our )?(conversation|chat|thread)|in this conversation what (did|have) i)\b/i;

export const WHO_IS_RE = /\bwho (?:is|was|are|were)\b/i;

export const LOCATION_RE =
  /\b(where (do|did) i live|where.s my (home|house|place)|where am i from|my (address|location|city|neighborhood))\b/i;

export const WORK_RE =
  /\b(what am i working on|what.s my (job|work|project|career)|am i (employed|working)|what do i do (for work|for a living))\b/i;

/** Queries that should bypass LLM and return structured foundation data directly. */
export function matchesFoundationRecallQuery(message: string): boolean {
  const text = message.trim();
  if (/^recall\b/i.test(text)) return true;
  if (CHARACTER_LIST_RE.test(text)) return true;
  if (BIOGRAPHY_RE.test(text)) return true;
  if (FAMILY_RECALL_RE.test(text)) return true;
  if (FAMILY_KIN_TERM_RE.test(text)) return true;
  if (LOCATION_RE.test(text)) return true;
  if (WORK_RE.test(text)) return true;
  if (TEMPORAL_RE.test(text)) return true;
  if (CONVERSATION_RECALL_RE.test(text)) return true;
  if (THREAD_RE.test(text)) return true;
  if (/^what did i (just )?(say|tell)/i.test(text)) return true;
  if (matchesEntityQuery(text)) return true;
  if (WHO_IS_RE.test(text)) return true;
  return false;
}

export type SyncRecallIntent =
  | 'character_list'
  | 'character_roster'
  | 'family'
  | 'biography'
  | 'entity'
  | 'location'
  | 'work'
  | 'temporal'
  | 'thread'
  | 'conversation'
  | null;

export function detectSyncRecallIntent(message: string): SyncRecallIntent {
  if (CONVERSATION_RECALL_RE.test(message)) return 'conversation';
  if (THREAD_RE.test(message)) return 'thread';
  if (CHARACTER_LIST_RE.test(message)) return 'character_roster';
  if (FAMILY_RECALL_RE.test(message) || FAMILY_KIN_TERM_RE.test(message)) return 'family';
  if (BIOGRAPHY_RE.test(message)) return 'biography';
  if (LOCATION_RE.test(message)) return 'location';
  if (WORK_RE.test(message)) return 'work';
  if (matchesEntityQuery(message)) return 'entity';
  if (TEMPORAL_RE.test(message)) return 'temporal';
  return null;
}

/** Foundation intents must not fall back to raw journal snippets. */
export function isFoundationPrimaryIntent(intent: string): boolean {
  return [
    'character_list',
    'character_roster',
    'family',
    'entity',
    'relationship_summary',
    'biography',
    'temporal',
    'conversation',
    'thread',
    'location',
    'work',
  ].includes(intent);
}
