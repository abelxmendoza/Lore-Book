/**
 * Retry continuity — the single mechanism that lets "try again" replay a
 * failed mode-routed turn (its mode, scope, and original message text)
 * instead of being reclassified from scratch as a generic message. There is
 * no other retry system in the codebase; this is it.
 */

import { supabaseAdmin } from '../supabaseClient';
import type { ResolvedTurnState } from '../chat/assistantPersistMetadata';

/**
 * Load the most recent assistant turn's resolved shape for this session, if
 * one was persisted. Reuses the same "last assistant message" lookup shape
 * already used elsewhere in the chat path (chatStream's follow-up-after-
 * recall block) rather than a new query pattern.
 */
export async function loadLastResolvedTurnState(
  userId: string,
  sessionId: string
): Promise<ResolvedTurnState | null> {
  try {
    const { data } = await supabaseAdmin
      .from('chat_messages')
      .select('metadata')
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const state = data?.metadata?.resolvedTurnState as ResolvedTurnState | undefined;
    if (!state || !state.mode || !state.originalMessageText) return null;
    return state;
  } catch {
    return null;
  }
}
