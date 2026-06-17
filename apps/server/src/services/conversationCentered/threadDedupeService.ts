import { supabaseAdmin } from '../supabaseClient';
import { isGenericThreadTitle, DRAFT_THREAD_TITLE } from '../../utils/threadTitleUtils';
import { loadThreadMessages, isThreadProtected } from './threadContentService';

type SessionRow = {
  id: string;
  title: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string;
};

function metadataMessages(row: SessionRow): Array<{ role: string; content: string }> {
  const raw = row.metadata?.messages;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is { role: string; content: string } => !!m && typeof m === 'object')
    .map((m) => ({ role: m.role, content: String(m.content ?? '') }));
}

function pickSurvivorIds(rows: SessionRow[], scores: Map<string, number>): string {
  return [...rows].sort((a, b) => {
    const scoreDiff = (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  })[0].id;
}

async function loadMessagesForSession(sessionId: string, userId: string) {
  return loadThreadMessages(userId, sessionId);
}

async function deleteSessions(userId: string, ids: string[]) {
  if (ids.length === 0) return;
  // Never delete sessions that still have durable chat_messages — data loss guard.
  const safeIds: string[] = [];
  for (const id of ids) {
    const { count } = await supabaseAdmin
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('session_id', id);
    if ((count ?? 0) === 0) safeIds.push(id);
  }
  if (safeIds.length === 0) return;
  await supabaseAdmin.from('conversation_messages').delete().eq('user_id', userId).in('session_id', safeIds);
  await supabaseAdmin.from('conversation_sessions').delete().eq('user_id', userId).in('id', safeIds);
}

export async function ensureUniqueThreadTitle(
  userId: string,
  threadId: string,
  title: string
): Promise<string> {
  const trimmed = title.trim();
  if (!trimmed || isGenericThreadTitle(trimmed)) return trimmed;

  const { data: collisions } = await supabaseAdmin
    .from('conversation_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('title', trimmed)
    .neq('id', threadId)
    .limit(1);

  if (!collisions?.length) return trimmed;

  const stamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${trimmed} · ${stamp}`;
}

export async function dedupeUserConversationThreads(userId: string): Promise<{
  deleted: number;
  titlesUpdated: number;
}> {
  const { data: rows, error } = await supabaseAdmin
    .from('conversation_sessions')
    .select('id, title, metadata, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error || !rows?.length) return { deleted: 0, titlesUpdated: 0 };

  const sessions = rows as SessionRow[];
  const messageCache = new Map<string, Array<{ role: string; content: string }>>();
  const scores = new Map<string, number>();

  for (const row of sessions) {
    const messages = await loadMessagesForSession(row.id, userId);
    messageCache.set(row.id, messages);
    scores.set(row.id, messages.length);
  }

  const toDelete = new Set<string>();

  // Fingerprint dedupe disabled — identical conversations are kept rather than deleted.
  // Users expect every thread they created to remain addressable.

  const emptyDrafts = sessions.filter((row) => {
    const msgs = messageCache.get(row.id) ?? [];
    return msgs.length === 0 && isGenericThreadTitle(row.title ?? DRAFT_THREAD_TITLE);
  });
  if (emptyDrafts.length > 1) {
    const keepId = pickSurvivorIds(emptyDrafts, scores);
    for (const row of emptyDrafts) {
      if (row.id !== keepId) {
        const protectedThread = await isThreadProtected(userId, row.id);
        if (!protectedThread) toDelete.add(row.id);
      }
    }
  }

  await deleteSessions(userId, [...toDelete]);

  let titlesUpdated = 0;
  const survivors = sessions.filter((r) => !toDelete.has(r.id));
  const titleGroups = new Map<string, SessionRow[]>();
  for (const row of survivors) {
    const title = (row.title ?? '').trim();
    if (!title || isGenericThreadTitle(title)) continue;
    const key = title.toLowerCase();
    const group = titleGroups.get(key) ?? [];
    group.push(row);
    titleGroups.set(key, group);
  }

  for (const group of titleGroups.values()) {
    if (group.length <= 1) continue;
    const sorted = [...group].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
    for (let i = 1; i < sorted.length; i++) {
      const row = sorted[i];
      const stamp = new Date(row.updated_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      const unique = `${row.title} · ${stamp}`;
      await supabaseAdmin
        .from('conversation_sessions')
        .update({ title: unique, updated_at: row.updated_at })
        .eq('id', row.id)
        .eq('user_id', userId);
      titlesUpdated += 1;
    }
  }

  return { deleted: toDelete.size, titlesUpdated };
}

export async function findReusableEmptyDraft(userId: string): Promise<string | null> {
  const { data: rows } = await supabaseAdmin
    .from('conversation_sessions')
    .select('id, title, metadata, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(15);

  if (!rows?.length) return null;

  for (const row of rows as SessionRow[]) {
    if (!isGenericThreadTitle(row.title ?? DRAFT_THREAD_TITLE)) continue;
    const metaMsgs = metadataMessages(row);
    if (metaMsgs.length > 0) continue;
    const { count } = await supabaseAdmin
      .from('conversation_messages')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', row.id);
    if (!count) return row.id;
  }
  return null;
}
