/**
 * Shared, monotonic conversation_sessions.updated_at bump.
 *
 * Four independent call sites touch this column (user message save — trivial
 * and full paths, assistant finalize, explicit touchActivity PATCH). None of
 * them coordinated with each other, so a delayed/retried write could stomp
 * updated_at forward to "now" with no new visible message, jumping a stale
 * thread to the top of the sidebar. The `.lt('updated_at', at)` filter makes
 * every write here a no-op unless it actually advances the timestamp.
 */
import { supabaseAdmin } from '../supabaseClient';

export async function bumpThreadActivity(
  userId: string,
  sessionId: string,
  at: string = new Date().toISOString(),
): Promise<void> {
  await supabaseAdmin
    .from('conversation_sessions')
    .update({ updated_at: at })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .lt('updated_at', at);
}
