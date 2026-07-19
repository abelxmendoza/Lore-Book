/**
 * Classify autobiographical sentences before narrative promotion.
 *
 * EVENT   → candidate for Moment (and maybe Event)
 * FACT/STATE/PROFILE/BACKGROUND → not events
 * GOAL/OPINION/EMOTION → not events
 * IGNORE  → greetings, tests, noise
 */

export type SentenceKind =
  | 'EVENT'
  | 'FACT'
  | 'STATE'
  | 'GOAL'
  | 'OPINION'
  | 'BACKGROUND'
  | 'EMOTION'
  | 'PROFILE'
  | 'IGNORE';

export type SentenceClassification = {
  kind: SentenceKind;
  confidence: number;
  reason: string;
};

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

const GREETING =
  /^(?:hi|hey|hello|yo|good (?:morning|afternoon|evening))\b[!,.\s]*(?:i(?:'?m| am)\s+[\p{L}'-]+(?:\s+[\p{L}'-]+){0,3})?[!,.\s]*$/iu;
const TEST_CHAT = /\btest(?:ing|ed)?\b.*\b(?:chat|response|improvements?|app)\b/i;
const PURE_COMMAND =
  /^(?:please\s+)?(?:recap|summari[sz]e|remember this|tell me|show me|list|generate|fix|update|delete|forget)\b/i;

const PROFILE =
  /^(?:my name is|i(?:'?m| am) a\b|i work as|i code|i live in|i live at)\b/i;
const STATE =
  /\b(?:i(?:'?m| am)|i(?:'?ve| have) been)\s+(?:unemployed|employed|single|married|tired|busy|broke|free|sick|depressed|anxious)\b/i;
const GOAL =
  /\b(?:i (?:want|wanna|hope|plan|gonna|am going) to|i(?:'?ll| will)|someday|eventually)\b/i;
const OPINION =
  /\b(?:i (?:think|believe|feel like|guess|assume)|in my opinion|probably|maybe)\b/i;
const EMOTION =
  /\b(?:i (?:feel|felt|miss(?:ed)?|loved|hate[sd]?|was (?:excited|sad|happy|angry|hurt|lonely|anxious|depressed)))\b/i;
const BACKGROUND =
  /\b(?:usually|generally|typically|in general|for years|growing up|back when)\b/i;
const FACT_STATIC =
  /^(?:i (?:can|know how to|have (?:a|an)|own)|can build|making \w+)\b/i;

const PERSONAL_EVENT =
  /\b(?:i|we)\s+(?:(?:briefly|recently|finally|just|today|yesterday)\s+)?(?:went|visited|saw|attended|worked|built|created|finished|completed|started|began|ended|left|joined|quit|moved|traveled|arrived|stayed|met|dated|broke up|hooked up|blocked|unblocked|hired|interviewed|onboard(?:ed|ing)|received|missed|skipped|ran|jogged|drove)\b/i;
const RELATIONSHIP_EVENT =
  /\b(?:blocked me|unblocked me|broke up|got together|hooked up|argued|fought|reconnected|fell out)\b/i;
const THIRD_PARTY_EVENT =
  /\b(?:[A-Z][\w'.-]+)\s+(?:blocked|unblocked|broke up with|hired|fired|invited|posted about)\b/;

/**
 * Classify one sentence/clause for the narrative ladder.
 */
export function classifySentence(input: string): SentenceClassification {
  const text = compact(input);
  if (!text || text.length < 3) {
    return { kind: 'IGNORE', confidence: 0.99, reason: 'empty' };
  }
  if (GREETING.test(text) || TEST_CHAT.test(text)) {
    return { kind: 'IGNORE', confidence: 0.98, reason: 'greeting_or_test' };
  }
  if (PURE_COMMAND.test(text) && !PERSONAL_EVENT.test(text)) {
    return { kind: 'IGNORE', confidence: 0.96, reason: 'command' };
  }
  if (/\?\s*$/.test(text) && !PERSONAL_EVENT.test(text)) {
    return { kind: 'IGNORE', confidence: 0.9, reason: 'question' };
  }

  // Profile / identity before event so "I'm a developer" never becomes an event.
  if (PROFILE.test(text) && !PERSONAL_EVENT.test(text)) {
    return { kind: 'PROFILE', confidence: 0.92, reason: 'identity_profile' };
  }
  if (FACT_STATIC.test(text) && !PERSONAL_EVENT.test(text)) {
    return { kind: 'FACT', confidence: 0.88, reason: 'static_capability' };
  }
  if (STATE.test(text) && !PERSONAL_EVENT.test(text) && !RELATIONSHIP_EVENT.test(text)) {
    return { kind: 'STATE', confidence: 0.86, reason: 'ongoing_state' };
  }
  if (BACKGROUND.test(text) && !PERSONAL_EVENT.test(text)) {
    return { kind: 'BACKGROUND', confidence: 0.8, reason: 'habitual_background' };
  }
  if (GOAL.test(text) && !PERSONAL_EVENT.test(text)) {
    return { kind: 'GOAL', confidence: 0.84, reason: 'future_goal' };
  }
  // Emotion without a concrete action stays emotion (e.g. "I miss Jamie").
  if (EMOTION.test(text) && !PERSONAL_EVENT.test(text) && !RELATIONSHIP_EVENT.test(text)) {
    return { kind: 'EMOTION', confidence: 0.85, reason: 'feeling_only' };
  }
  if (OPINION.test(text) && !PERSONAL_EVENT.test(text) && !RELATIONSHIP_EVENT.test(text)) {
    return { kind: 'OPINION', confidence: 0.82, reason: 'belief_only' };
  }

  if (PERSONAL_EVENT.test(text) || RELATIONSHIP_EVENT.test(text) || THIRD_PARTY_EVENT.test(text)) {
    return { kind: 'EVENT', confidence: 0.9, reason: 'personal_happening' };
  }

  // Default: low-confidence fact — do not promote.
  return { kind: 'FACT', confidence: 0.55, reason: 'unclassified_non_event' };
}

/** Only EVENT sentences may become Moments / Events. */
export function mayBecomeMoment(kind: SentenceKind): boolean {
  return kind === 'EVENT';
}
