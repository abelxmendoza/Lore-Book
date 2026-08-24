/**
 * Conversation Goal Tracker — persists *why* the user is talking to
 * LoreBook (purpose), stable across incidental topic/entity changes.
 *
 * Different axis from responseScope's ActiveConversationContext (topic/
 * entity anchoring, stateless, recomputed every turn, decays after 6
 * turns): the goal only switches on a strong, goal-shaped signal in the
 * message itself. A new noun, pronoun, or ScopeIntent change never flips
 * it alone — that stability is the whole point of this component. See
 * conversationReasoning/index.ts for how the five adjacent "plan" concepts
 * in this codebase divide responsibility; do not merge this with
 * activeContextTracker.ts.
 *
 * Persisted on conversation_sessions.metadata.conversationGoal (jsonb) —
 * the same idiom chatPersistenceService.ts already uses for
 * metadata->>quick_chat. One goal per session is the right grain; writes
 * only happen when the goal actually changes.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { ConversationGoal, ConversationGoalState } from './goalTrackerTypes';

const GOAL_RULES: Array<{ goal: ConversationGoal; pattern: RegExp }> = [
  {
    goal: 'testing_memory',
    pattern:
      /\b(do you (?:remember|recall)|let'?s test|i'?m testing (?:you|lorebook|your memory)|see if you remember|pop quiz|testing (?:whether|if) you)\b/i,
  },
  {
    goal: 'debugging_lorebook',
    pattern:
      /\b(why (?:does|did|is) lorebook|lorebook (?:keeps|is) (?:doing|being|acting)|this is a bug|that'?s a bug|debug (?:mode|this)|not working right|broken again|glitch(?:ing)?|acting up)\b/i,
  },
  {
    goal: 'planning',
    pattern:
      /\b(let'?s plan|plan out|help me plan|planning (?:my|out)|map out my (?:next|future)|what'?s my plan for)\b/i,
  },
  {
    goal: 'receiving_advice',
    pattern:
      /\b(give me advice|advice on|what should i do about|help me decide|what would you (?:do|suggest)|any advice)\b/i,
  },
  {
    goal: 'reflecting_on_life',
    pattern:
      /\b(reflect(?:ing)? on|looking back on|thinking about who i (?:was|am|used to be)|reminisc(?:e|ing)|been thinking about my life)\b/i,
  },
  {
    goal: 'learning_about_character',
    pattern:
      /\b(i want to (?:learn|know) (?:more )?about|tell me everything about|let'?s talk about who|catch me up on)\s+\p{L}/iu,
  },
];

/**
 * Deterministic, no LLM. Only a strong goal-shaped signal changes the
 * tracked goal; anything else (a new entity, a topic shift, ordinary
 * follow-up chatter) leaves it exactly where it was.
 */
export function resolveConversationGoal(input: {
  message: string;
  current: ConversationGoalState | null;
  isCorrection: boolean;
  isRetry: boolean;
}): { next: ConversationGoalState; changed: boolean; reason: string } {
  const { message, current, isCorrection, isRetry } = input;
  const now = new Date().toISOString();
  const setFromMessage = message.slice(0, 120);

  if (isRetry && current) {
    return {
      next: { ...current, turnsSinceSet: current.turnsSinceSet + 1 },
      changed: false,
      reason: 'retry_holds_goal',
    };
  }

  if (isCorrection) {
    if (current) {
      return {
        next: { ...current, turnsSinceSet: current.turnsSinceSet + 1 },
        changed: false,
        reason: 'correction_does_not_change_goal',
      };
    }
    return {
      next: { goal: 'giving_corrections', setAt: now, setFromMessage, turnsSinceSet: 0, confidence: 0.7 },
      changed: true,
      reason: 'correction_with_no_prior_goal',
    };
  }

  const match = GOAL_RULES.find((rule) => rule.pattern.test(message));
  if (match) {
    if (current && current.goal === match.goal) {
      return {
        next: { ...current, turnsSinceSet: current.turnsSinceSet + 1 },
        changed: false,
        reason: 'goal_reinforced',
      };
    }
    return {
      next: { goal: match.goal, setAt: now, setFromMessage, turnsSinceSet: 0, confidence: 0.75 },
      changed: true,
      reason: `strong_signal:${match.goal}`,
    };
  }

  if (current) {
    return {
      next: { ...current, turnsSinceSet: current.turnsSinceSet + 1 },
      changed: false,
      reason: 'no_strong_signal_goal_holds',
    };
  }

  return {
    next: { goal: 'general', setAt: now, setFromMessage, turnsSinceSet: 0, confidence: 0.3 },
    changed: true,
    reason: 'no_prior_goal_defaulting_general',
  };
}

export async function loadConversationGoal(sessionId: string): Promise<ConversationGoalState | null> {
  try {
    const { data } = await supabaseAdmin
      .from('conversation_sessions')
      .select('metadata')
      .eq('id', sessionId)
      .maybeSingle();
    const metadata = (data as { metadata?: Record<string, unknown> } | null)?.metadata;
    return (metadata?.conversationGoal as ConversationGoalState | undefined) ?? null;
  } catch (e) {
    logger.debug({ e, sessionId }, 'ConversationGoalTracker: load failed');
    return null;
  }
}

export async function persistConversationGoal(sessionId: string, state: ConversationGoalState): Promise<void> {
  try {
    const { data } = await supabaseAdmin
      .from('conversation_sessions')
      .select('metadata')
      .eq('id', sessionId)
      .maybeSingle();
    const metadata = (data as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
    await supabaseAdmin
      .from('conversation_sessions')
      .update({ metadata: { ...metadata, conversationGoal: state } })
      .eq('id', sessionId);
  } catch (e) {
    logger.debug({ e, sessionId }, 'ConversationGoalTracker: persist failed');
  }
}
