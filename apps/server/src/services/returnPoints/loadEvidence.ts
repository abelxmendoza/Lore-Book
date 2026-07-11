/**
 * Load evidence snippets for return-point detection from existing stores.
 * Best-effort; never throws to chat path.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { EvidenceSnippet } from './types';

export async function loadReturnPointEvidence(
  userId: string,
  opts?: { threadId?: string | null; limit?: number },
): Promise<EvidenceSnippet[]> {
  const limit = opts?.limit ?? 40;
  const out: EvidenceSnippet[] = [];

  // Recent user chat messages (waiting / plan language)
  try {
    let q = supabaseAdmin
      .from('chat_messages')
      .select('id, content, created_at, session_id, role')
      .eq('user_id', userId)
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (opts?.threadId) {
      q = q.eq('session_id', opts.threadId);
    }
    const { data } = await q;
    for (const row of data ?? []) {
      const text = String((row as { content?: string }).content ?? '').trim();
      if (!text) continue;
      out.push({
        id: String((row as { id: string }).id),
        text,
        sourceType: 'message',
        threadId: (row as { session_id?: string }).session_id ?? opts?.threadId ?? null,
        at: String((row as { created_at?: string }).created_at ?? new Date().toISOString()),
        fromAssistant: false,
      });
    }
  } catch (e) {
    logger.debug({ e }, 'returnPoints: chat_messages load failed');
  }

  // Goals
  try {
    const { data } = await supabaseAdmin
      .from('goals')
      .select('id, title, description, status, updated_at, created_at, metadata')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(20);
    for (const g of data ?? []) {
      const status = String((g as { status?: string }).status ?? 'active') as
        | 'active'
        | 'paused'
        | 'abandoned'
        | 'completed';
      const title = String((g as { title?: string }).title ?? '');
      const desc = String((g as { description?: string }).description ?? '');
      out.push({
        id: String((g as { id: string }).id),
        text: `${title}. ${desc}`.trim(),
        sourceType: 'goal',
        at: String(
          (g as { updated_at?: string }).updated_at ??
            (g as { created_at?: string }).created_at ??
            new Date().toISOString(),
        ),
        goalStatus: status,
        confidence: status === 'active' ? 0.85 : 0.5,
      });
    }
  } catch (e) {
    logger.debug({ e }, 'returnPoints: goals load failed');
  }

  // Meaning artifacts (lessons/plans sometimes encode waiting)
  try {
    const { listActiveMeaningForUser } = await import('../memoryQuality/meaningArtifactStore');
    const rows = await listActiveMeaningForUser(userId, { limit: 24 });
    for (const r of rows) {
      out.push({
        id: r.id,
        text: r.display_label,
        sourceType: 'meaning',
        at: (r as { updated_at?: string }).updated_at ?? new Date().toISOString(),
        confidence: r.confidence,
      });
    }
  } catch (e) {
    logger.debug({ e }, 'returnPoints: meaning load failed');
  }

  return out;
}
