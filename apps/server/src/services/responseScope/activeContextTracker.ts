/**
 * Conversational active context — what the thread is currently "about".
 *
 * Derived from recent history every turn (deterministic, no LLM, no storage):
 * the most recent user turn with an explicit intent anchors the context, and
 * every entity named since — including the assistant's answer, which is what
 * "tell me more about them" actually refers to — rides along. Context-free
 * follow-ups inherit it; an explicit new question replaces it; it decays
 * after enough unrelated chatter.
 */

import { isFollowUpShaped } from './responseModeResolver';
import { detectScopeIntent, extractCandidateEntities } from './responseScopePlanner';
import type { ActiveConversationContext, EntityRef } from './responseScopeTypes';

/** An anchor older than this many general user turns is stale — no inheritance. */
export const MAX_ACTIVE_CONTEXT_TURNS = 6;

const MAX_ACTIVE_ENTITIES = 8;

type HistoryEntry = { role: string; content: string };

export function deriveActiveContext(
  history: ReadonlyArray<HistoryEntry>,
): ActiveConversationContext | undefined {
  // Some callers include the current user turn in history. A trailing
  // follow-up must not anchor itself — inspect only what precedes it.
  let end = history.length;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (entry.role !== 'user' || !entry.content.trim()) continue;
    if (detectScopeIntent(entry.content) === 'general' && isFollowUpShaped(entry.content)) {
      end = index;
    }
    break;
  }

  let anchorIndex = -1;
  let intent: ActiveConversationContext['intent'] | undefined;
  let userTurnsSinceAnchor = 0;
  for (let index = end - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (entry.role !== 'user' || !entry.content.trim()) continue;
    const turnIntent = detectScopeIntent(entry.content);
    if (turnIntent !== 'general') {
      anchorIndex = index;
      intent = turnIntent;
      break;
    }
    userTurnsSinceAnchor += 1;
    if (userTurnsSinceAnchor >= MAX_ACTIVE_CONTEXT_TURNS) return undefined;
  }
  if (anchorIndex < 0 || !intent) return undefined;

  const entities = new Map<string, EntityRef>();
  const collect = (text: string) => {
    for (const entity of extractCandidateEntities(text)) {
      if (entities.size >= MAX_ACTIVE_ENTITIES) return;
      const key = entity.name.toLowerCase();
      if (!entities.has(key)) entities.set(key, entity);
    }
  };

  // User turns first — they state the topic. Then the latest assistant turn
  // only: its names are what an anaphoric follow-up points at, but older
  // assistant prose over-extracts capitalized noise.
  for (let index = anchorIndex; index < end; index += 1) {
    const entry = history[index];
    if (entry.role === 'user' && entry.content.trim()) collect(entry.content);
  }
  for (let index = end - 1; index >= anchorIndex; index -= 1) {
    const entry = history[index];
    if (entry.role === 'assistant' && entry.content.trim()) {
      collect(entry.content);
      break;
    }
  }

  return { intent, entities: [...entities.values()], userTurnsSinceAnchor };
}
