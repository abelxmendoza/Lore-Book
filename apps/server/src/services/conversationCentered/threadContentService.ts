import { supabaseAdmin } from '../supabaseClient';

export type ThreadMessageRow = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  metadata?: Record<string, unknown> | null;
};

function metadataMessages(meta: Record<string, unknown> | null | undefined): ThreadMessageRow[] {
  const raw = meta?.messages;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
    .map((m, idx) => ({
      id: (m.id as string) ?? `meta-${idx}`,
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content ?? ''),
      created_at: (m.timestamp as string) ?? new Date().toISOString(),
      metadata: (m.metadata as Record<string, unknown>) ?? null,
    }));
}

function normalizeContent(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

function sourceRank(id: string): number {
  if (id.startsWith('meta-') || id.startsWith('user-') || id.startsWith('assistant-')) return 0;
  return 1;
}

function mergeMessageSources(sources: ThreadMessageRow[][]): ThreadMessageRow[] {
  const byFingerprint = new Map<string, ThreadMessageRow>();

  for (const source of sources) {
    for (const message of source) {
      if (!message.content.trim()) continue;
      const fingerprint = `${message.role}:${normalizeContent(message.content)}`;
      const existing = byFingerprint.get(fingerprint);
      if (!existing || sourceRank(message.id) > sourceRank(existing.id)) {
        byFingerprint.set(fingerprint, message);
      }
    }
  }

  return [...byFingerprint.values()].sort((a, b) => {
    const timeDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (timeDiff !== 0) return timeDiff;
    if (a.role === b.role) return 0;
    return a.role === 'user' ? -1 : 1;
  });
}

/** Unified loader: merges metadata + conversation_messages + chat_messages. */
export async function loadThreadMessages(
  userId: string,
  sessionId: string
): Promise<ThreadMessageRow[]> {
  const [{ data: session }, { data: convMsgs }, { data: chatMsgs }] = await Promise.all([
    supabaseAdmin
      .from('conversation_sessions')
      .select('metadata')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle(),
    supabaseAdmin
      .from('conversation_messages')
      .select('id, role, content, created_at, metadata')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('chat_messages')
      .select('id, role, content, created_at, metadata')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),
  ]);

  const fromMeta = metadataMessages(session?.metadata as Record<string, unknown> | null);
  const fromConversation = (convMsgs ?? []).map((m) => ({
    id: m.id,
    role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
    content: String(m.content ?? ''),
    created_at: m.created_at,
    metadata: (m.metadata as Record<string, unknown>) ?? null,
  }));
  const fromChat = (chatMsgs ?? []).map((m) => ({
    id: m.id,
    role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
    content: String(m.content ?? ''),
    created_at: m.created_at,
    metadata: (m.metadata as Record<string, unknown>) ?? null,
  }));

  return mergeMessageSources([fromConversation, fromChat, fromMeta]);
}

export async function threadMessageCount(userId: string, sessionId: string): Promise<number> {
  const messages = await loadThreadMessages(userId, sessionId);
  return messages.length;
}

export async function threadHasEntityLinks(userId: string, sessionId: string): Promise<boolean> {
  const { count } = await supabaseAdmin
    .from('entity_conversation_links')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('session_id', sessionId);
  return (count ?? 0) > 0;
}

export async function threadHasIngestedKnowledge(userId: string, sessionId: string): Promise<boolean> {
  const [{ count: convCount }, { count: chatCount }] = await Promise.all([
    supabaseAdmin
      .from('conversation_messages')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('user_id', userId),
    supabaseAdmin
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('user_id', userId),
  ]);

  if ((convCount ?? 0) > 0 || (chatCount ?? 0) > 0) return true;

  // Entity facts tied to utterances from this session (character knowledge survived thread UI loss)
  const { count: linkCount } = await supabaseAdmin
    .from('entity_conversation_links')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('session_id', sessionId);

  return (linkCount ?? 0) > 0;
}

/** True when a thread must not be auto-deleted (empty purge, dedupe, empty-on-open). */
export async function isThreadProtected(userId: string, sessionId: string): Promise<boolean> {
  const [msgCount, hasLinks, hasKnowledge] = await Promise.all([
    threadMessageCount(userId, sessionId),
    threadHasEntityLinks(userId, sessionId),
    threadHasIngestedKnowledge(userId, sessionId),
  ]);
  if (msgCount > 0) return true;
  if (hasLinks) return true;
  if (hasKnowledge) return true;
  return false;
}

export async function recoverOrphanedChatSessions(userId: string): Promise<number> {
  const { data: chatRows } = await supabaseAdmin
    .from('chat_messages')
    .select('session_id')
    .eq('user_id', userId)
    .not('session_id', 'is', null);

  const sessionIds = [...new Set((chatRows ?? []).map((r) => r.session_id as string).filter(Boolean))];
  if (sessionIds.length === 0) return 0;

  const { data: existing } = await supabaseAdmin
    .from('conversation_sessions')
    .select('id')
    .eq('user_id', userId)
    .in('id', sessionIds);

  const existingSet = new Set((existing ?? []).map((r) => r.id));
  const orphaned = sessionIds.filter((id) => !existingSet.has(id));
  if (orphaned.length === 0) return 0;

  let recovered = 0;
  for (const sessionId of orphaned) {
    const messages = await loadThreadMessages(userId, sessionId);
    if (messages.length === 0) continue;

    const firstUser = messages.find((m) => m.role === 'user');
    const titleSnippet = firstUser?.content?.slice(0, 60)?.trim() || 'Recovered conversation';
    const now = new Date().toISOString();

    const { error } = await supabaseAdmin.from('conversation_sessions').insert({
      id: sessionId,
      user_id: userId,
      title: titleSnippet.length > 50 ? `${titleSnippet.slice(0, 47)}…` : titleSnippet,
      started_at: messages[0]?.created_at ?? now,
      created_at: messages[0]?.created_at ?? now,
      updated_at: messages[messages.length - 1]?.created_at ?? now,
      metadata: {
        recovered: true,
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.created_at,
        })),
      },
    });

    if (!error) recovered += 1;
  }

  return recovered;
}

/** Recover a single orphaned session if chat_messages exist but conversation_sessions row is missing. */
export async function recoverOrphanSession(userId: string, sessionId: string): Promise<boolean> {
  const { data: existing } = await supabaseAdmin
    .from('conversation_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) return false;

  const messages = await loadThreadMessages(userId, sessionId);
  if (messages.length === 0) return false;

  const firstUser = messages.find((m) => m.role === 'user');
  const titleSnippet = firstUser?.content?.slice(0, 60)?.trim() || 'Recovered conversation';
  const now = new Date().toISOString();

  const { error } = await supabaseAdmin.from('conversation_sessions').insert({
    id: sessionId,
    user_id: userId,
    title: titleSnippet.length > 50 ? `${titleSnippet.slice(0, 47)}…` : titleSnippet,
    started_at: messages[0]?.created_at ?? now,
    created_at: messages[0]?.created_at ?? now,
    updated_at: messages[messages.length - 1]?.created_at ?? now,
    metadata: {
      recovered: true,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.created_at,
      })),
    },
  });

  return !error;
}

/** Bump updated_at so entity-linked origin threads surface in the thread list. */
export async function touchThreadActivity(userId: string, sessionId: string): Promise<void> {
  await supabaseAdmin
    .from('conversation_sessions')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('user_id', userId);
}

export async function getLinkedSessionIds(userId: string): Promise<string[]> {
  const ids = new Set<string>();

  const { data: characters } = await supabaseAdmin
    .from('characters')
    .select('metadata')
    .eq('user_id', userId)
    .limit(500);

  for (const row of characters ?? []) {
    const meta = (row.metadata as Record<string, unknown>) ?? {};
    const origin = meta.origin_thread_id;
    if (typeof origin === 'string') ids.add(origin);
    const threadIds = meta.thread_ids;
    if (Array.isArray(threadIds)) {
      for (const id of threadIds) {
        if (typeof id === 'string') ids.add(id);
      }
    }
  }

  try {
    const { data: links } = await supabaseAdmin
      .from('entity_conversation_links')
      .select('session_id')
      .eq('user_id', userId)
      .limit(200);
    for (const link of links ?? []) {
      if (typeof link.session_id === 'string') ids.add(link.session_id);
    }
  } catch {
    // Table may not exist until migration is applied
  }

  return [...ids];
}

export async function getThreadStatus(userId: string, sessionId: string) {
  const [messages, hasLinks, protectedFlag, linkRows] = await Promise.all([
    loadThreadMessages(userId, sessionId),
    threadHasEntityLinks(userId, sessionId),
    isThreadProtected(userId, sessionId),
    supabaseAdmin
      .from('entity_conversation_links')
      .select('entity_type, entity_id, link_kind, mention_count, first_linked_at')
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .order('first_linked_at', { ascending: true }),
  ]);

  return {
    sessionId,
    messageCount: messages.length,
    protected: protectedFlag,
    hasEntityLinks: hasLinks,
    linkedEntities: linkRows.data ?? [],
    messages,
  };
}
