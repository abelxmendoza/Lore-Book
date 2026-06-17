/**
 * Backfills metadata.mentionedEntities on legacy assistant rows that were
 * persisted before stream metadata included entity chips.
 */
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { resolveMessageEntitiesForDisplay } from './messageEntityDisplayService';

interface AssistantRow {
  id: string;
  session_id: string;
  content: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface UserRow {
  session_id: string;
  content: string | null;
  created_at: string;
}

function needsEntityBackfill(metadata: Record<string, unknown> | null | undefined): boolean {
  if (metadata?.entity_backfill_at) return false;
  const mentioned = metadata?.mentionedEntities;
  return !Array.isArray(mentioned) || mentioned.length === 0;
}

function precedingUserMessage(users: UserRow[], assistantCreatedAt: string): UserRow | null {
  let candidate: UserRow | null = null;
  for (const row of users) {
    if (row.created_at < assistantCreatedAt) candidate = row;
    else break;
  }
  return candidate;
}

/** Resolve entity chips from the paired user turn and persist on assistant metadata. */
export async function backfillMentionedEntitiesForUser(userId: string): Promise<number> {
  const { data: assistantRows, error } = await supabaseAdmin
    .from('chat_messages')
    .select('id, session_id, content, created_at, metadata')
    .eq('user_id', userId)
    .eq('role', 'assistant')
    .order('created_at', { ascending: true });

  if (error) {
    logger.warn({ err: error, userId }, 'entityMentionBackfill: assistant query failed');
    return 0;
  }

  const candidates = ((assistantRows ?? []) as AssistantRow[]).filter((row) =>
    needsEntityBackfill(row.metadata)
  );
  if (candidates.length === 0) return 0;

  const sessionIds = [...new Set(candidates.map((row) => row.session_id).filter(Boolean))];
  if (sessionIds.length === 0) return 0;

  const { data: userRows, error: userErr } = await supabaseAdmin
    .from('chat_messages')
    .select('session_id, content, created_at')
    .eq('user_id', userId)
    .eq('role', 'user')
    .in('session_id', sessionIds)
    .order('created_at', { ascending: true });

  if (userErr) {
    logger.warn({ err: userErr, userId }, 'entityMentionBackfill: user query failed');
    return 0;
  }

  const usersBySession = new Map<string, UserRow[]>();
  for (const row of (userRows ?? []) as UserRow[]) {
    const list = usersBySession.get(row.session_id) ?? [];
    list.push(row);
    usersBySession.set(row.session_id, list);
  }

  let updated = 0;
  for (const assistant of candidates) {
    const users = usersBySession.get(assistant.session_id) ?? [];
    const paired = precedingUserMessage(users, assistant.created_at);
    const userContent = paired?.content?.trim() ?? '';
    if (!userContent) continue;

    const entities = await resolveMessageEntitiesForDisplay(userId, userContent);
    const nextMeta: Record<string, unknown> = {
      ...(assistant.metadata ?? {}),
      entity_backfill_at: new Date().toISOString(),
    };
    if (entities.length > 0) {
      nextMeta.mentionedEntities = entities.map(
        ({ id, name, type, confidence, provenance, mentionStatus }) => ({
          id,
          name,
          type,
          ...(confidence !== undefined ? { confidence } : {}),
          ...(provenance ? { provenance } : {}),
          ...(mentionStatus ? { mentionStatus } : {}),
        })
      );
    }

    const { error: updateErr } = await supabaseAdmin
      .from('chat_messages')
      .update({ metadata: nextMeta })
      .eq('id', assistant.id)
      .eq('user_id', userId);

    if (updateErr) {
      logger.warn({ err: updateErr, messageId: assistant.id }, 'entityMentionBackfill: update failed');
      continue;
    }
    updated += 1;
  }

  if (updated > 0) {
    logger.info({ userId, updated }, 'entityMentionBackfill: assistant metadata repaired');
  }
  return updated;
}
