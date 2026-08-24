/**
 * Conversational Memory tier gate — differentiates current/recent
 * conversation from long-term autobiography. "Questions about what I just
 * told you should never invoke global retrieval first" (Blueprint 21).
 *
 * A narrow regex gate (matchesThreadRecallQuery, chat/threadRecallService.ts)
 * already short-circuits recall-*phrased* questions ("what did I just tell
 * you"). This gate covers the wider, more common case: an ordinary follow-up
 * with no recall-style wording at all ("wait, how old is she?").
 *
 * Deliberately cheap and conservative — no LLM call, reuses
 * continuityAlive/tokenize.ts's existing jaccard overlap. Only ever SKIPS
 * retrieval when confident; an uncertain case always falls through to normal
 * retrieval, never the other way around.
 */

import { tokenSet, jaccard } from '../continuityAlive/tokenize';
import { isFollowUpShaped } from '../responseScope/responseModeResolver';
import { MAX_ACTIVE_CONTEXT_TURNS } from '../responseScope/activeContextTracker';
import type { ActiveConversationContext } from '../responseScope/responseScopeTypes';

export const MEMORY_TIER_MIN_OVERLAP = 0.18;
export const MEMORY_TIER_MIN_CONFIDENCE = 0.55;

const RECENT_TURN_WINDOW = 3;

export type ConversationTierDecision = {
  shortCircuit: boolean;
  reason: string;
  overlap: number;
  confidence: number;
};

type HistoryEntry = { role: string; content: string };

export function evaluateConversationTierGate(input: {
  message: string;
  activeContext: ActiveConversationContext | undefined;
  conversationHistory: ReadonlyArray<HistoryEntry>;
}): ConversationTierDecision {
  const { message, activeContext, conversationHistory } = input;

  if (!activeContext || activeContext.userTurnsSinceAnchor >= MAX_ACTIVE_CONTEXT_TURNS) {
    return { shortCircuit: false, reason: 'active_context_stale_or_absent', overlap: 0, confidence: 0 };
  }

  if (!isFollowUpShaped(message)) {
    return { shortCircuit: false, reason: 'not_follow_up_shaped', overlap: 0, confidence: 0 };
  }

  const recentText = conversationHistory
    .slice(-RECENT_TURN_WINDOW)
    .map((turn) => turn.content)
    .join(' ');
  if (!recentText.trim()) {
    return { shortCircuit: false, reason: 'no_recent_history', overlap: 0, confidence: 0 };
  }

  const overlap = jaccard(tokenSet(message), tokenSet(recentText));
  const confidence = Math.min(1, overlap / (MEMORY_TIER_MIN_OVERLAP * 2));

  if (overlap >= MEMORY_TIER_MIN_OVERLAP && confidence >= MEMORY_TIER_MIN_CONFIDENCE) {
    return { shortCircuit: true, reason: 'confident_recent_turn_overlap', overlap, confidence };
  }
  return { shortCircuit: false, reason: 'overlap_below_floor', overlap, confidence };
}
