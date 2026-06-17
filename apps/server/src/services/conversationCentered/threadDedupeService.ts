import { supabaseAdmin } from '../supabaseClient';
import { isGenericThreadTitle, DRAFT_THREAD_TITLE } from '../../utils/threadTitleUtils';
import { loadThreadMessages, isThreadProtected } from './threadContentService';

type SessionRow = {
  id: string;
  title: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string;
};

function normalizeContent(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function metadataMessages(row: SessionRow): Array<{ role: string; content: string }> {
  const raw = row.metadata?.messages;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is { role: string; content: string } => !!m && typeof m === 'object')
    .map((m) => ({ role: m.role, content: String(m.content ?? '') }));
}

function conversationFingerprint(messages: Array<{ role: string; content: string }>): string | null {
  const parts = messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content?.trim())
    .map((m) => `${m.role === 'user' ? 'u' : 'a'}:${normalizeContent(m.content)}`);
  if (parts.length === 0) return null;
  return parts.join('\n');
}

function pickSurvivorIds(rows: SessionRow[], scores: Map<string, number>): string {
  return [...rows].sort((a, b) => {
    const scoreDiff = (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  })[0].id;
}

async function loadMessagesForSession(sessionId: string, userId: string, row: SessionRow) {
  return loadThreadMessages(userId, sessionId);
}

async function deleteSessions(userId: string, ids: string[]) {
  if (ids.length === 0) return;
  await supabaseAdmin.from('chat_messages').delete().eq('user_id', userId).in('session_id', ids);
  await supabaseAdmin.from('conversation_messages').delete().eq('user_id', userId).in('session_id', ids);
  await supabaseAdmin.from('conversation_sessions').delete().eq('user_id', userId).in('id', ids);
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
    const messages = await loadMessagesForSession(row.id, userId, row);
    messageCache.set(row.id, messages);
    scores.set(row.id, messages.length);
  }

  const toDelete = new Set<string>();

  const byFingerprint = new Map<string, SessionRow[]>();
  for (const row of sessions) {
    const fp = conversationFingerprint(messageCache.get(row.id) ?? []);
    if (!fp) continue;
    const group = byFingerprint.get(fp) ?? [];
    group.push(row);
    byFingerprint.set(fp, group);
  }

  for (const group of byFingerprint.values()) {
    if (group.length <= 1) continue;
    const keepId = pickSurvivorIds(group, scores);
    for (const row of group) {
      if (row.id !== keepId) {
        const protectedThread = await isThreadProtected(userId, row.id);
        if (!protectedThread) toDelete.add(row.id);
      }
    }
  }

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
