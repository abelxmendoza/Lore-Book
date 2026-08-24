/**
 * Discourse Reasoner — resolves references like "that", "it", "she", "this
 * conversation", "our first breakthrough" using conversation history BEFORE
 * retrieval. Distinguishes an ENTITY referent ("she" -> "Wren") from an
 * EXCHANGE/TOPIC referent ("that conversation" -> "our conversation about
 * Jerry", not "Jerry himself") — the blueprint's own example.
 *
 * Deterministic, no LLM: only resolves on a strong signal, mirroring
 * goalTracker.ts's stickiness discipline. Weak/ambiguous cases stay
 * unresolved rather than guessing.
 */

import type { ActiveConversationContext } from '../responseScope/responseScopeTypes';
import type { DiscourseResolution, EntityReferent, ExchangeReferent } from './discourseReasonerTypes';

export const DISCOURSE_ENTITY_REWRITE_MIN_CONFIDENCE = 0.6;
export const DISCOURSE_EXCHANGE_MIN_CONFIDENCE = 0.55;

/** Demonstrative phrases pointing at a prior TOPIC/EXCHANGE, not a single entity. */
const EXCHANGE_PHRASE_RE =
  /\b(that conversation|this conversation|our (?:first |last |early )?(?:conversation|talk|breakthrough|exchange)|those memories|that (?:whole )?(?:thing|topic|subject))\b/i;

/** "when was that" / "when that was" / "when did that happen" — asking about the exchange's timing, not the entity. */
const WHEN_WAS_THAT_RE =
  /\bwhen\b.{0,20}\b(?:that|it)\b.{0,15}\b(?:was|happened|occurred)\b|\bwhen (?:was|did) (?:that|it)\b/i;

const SHORT_QUESTION_MAX_CHARS = 80;

/** Bare pronouns/demonstratives that can stand in for a single entity — wider than responseModeResolver's ANAPHORA_RE, which is missing neuter demonstratives entirely. */
const BARE_ANAPHORA_RE = /\b(he|him|his|she|her|hers|they|them|their|theirs|that one|it|this|that|those)\b/i;

type HistoryEntry = { role: string; content: string };

export function resolveDiscourseReferents(input: {
  message: string;
  history: ReadonlyArray<HistoryEntry>;
  activeContext: ActiveConversationContext | undefined;
}): DiscourseResolution {
  const { message, activeContext } = input;
  const text = message.trim();
  if (!text) return { kind: 'unresolved' };

  if (EXCHANGE_PHRASE_RE.test(text) || WHEN_WAS_THAT_RE.test(text)) {
    const entities = activeContext?.entities ?? [];
    const involvedEntities = entities.map((e) => e.name);
    const topicSummary =
      entities.length > 0 ? `our conversation about ${entities[0].name}` : 'our earlier conversation';
    const resolution: ExchangeReferent = {
      kind: 'exchange',
      pronoun: text.slice(0, 60),
      topicSummary,
      involvedEntities,
      confidence: entities.length > 0 ? 0.75 : 0.55,
    };
    return resolution;
  }

  const isShortQuestion = text.length <= SHORT_QUESTION_MAX_CHARS && text.endsWith('?');
  const anaphoraMatch = text.match(BARE_ANAPHORA_RE);
  if (isShortQuestion && anaphoraMatch && (activeContext?.entities.length ?? 0) > 0) {
    const entity = activeContext!.entities[0];
    const resolution: EntityReferent = {
      kind: 'entity',
      pronoun: anaphoraMatch[0],
      entityName: entity.name,
      confidence: 0.65,
    };
    return resolution;
  }

  return { kind: 'unresolved' };
}

/** Single word-boundary substitution, first occurrence only — safe for a single-word pronoun, unlike the exchange case's multi-word topic phrase. */
export function applyEntityReferentRewrite(message: string, referent: EntityReferent): string {
  const escaped = referent.pronoun.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escaped}\\b`, 'i');
  if (!re.test(message)) return message;
  return message.replace(re, referent.entityName);
}
